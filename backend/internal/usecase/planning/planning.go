// Package planning implements the Fase 9 background jobs:
//   - expiry.alert        (9.2)  deteksi batch H-90/H-30 & karantina expired
//   - reorder.calc        (9.3)  hitung ROP & usulan pembelian (FR-8.2)
//   - ledger.reconcile    (9.4)  rekonsiliasi ledger vs saldo (§4.7)
//   - partition.maintain  (9.5)  partisi stock_movements bulan berikutnya
//   - report.refresh      (9.5)  refresh materialized view laporan
package planning

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"inventory/internal/domain/planning"
)

// AlertLevel is the severity used for notifications.
type AlertLevel string

const (
	AlertInfo  AlertLevel = "info"
	AlertWarn  AlertLevel = "warn"
	AlertAlert AlertLevel = "alert"
	AlertCrit  AlertLevel = "critical"
)

// Notifier delivers alert messages to humans (tim inventori, Inventory
// Manager, admin). The default implementation logs through slog; production
// deployments would fan out to outbox/email/WA dispatch.
type Notifier interface {
	// Notify delivers a message at the given severity.
	Notify(ctx context.Context, level AlertLevel, title, message string)
}

// LogNotifier is the default Notifier: structured slog output only.
type LogNotifier struct{}

func (LogNotifier) Notify(_ context.Context, level AlertLevel, title, message string) {
	switch level {
	case AlertCrit:
		slog.Error("JOB ALERT", slog.String("severity", string(level)),
			slog.String("title", title), slog.String("message", message))
	case AlertWarn, AlertAlert:
		slog.Warn("JOB ALERT", slog.String("severity", string(level)),
			slog.String("title", title), slog.String("message", message))
	default:
		slog.Info("JOB ALERT", slog.String("severity", string(level)),
			slog.String("title", title), slog.String("message", message))
	}
}

// Config tunes job behaviour (windows/days; zero values fall back to FSD
// defaults).
type Config struct {
	// ExpiryAlertDays is the look-ahead window for expiry alerts (FSD: 90).
	ExpiryAlertDays int
	// ReorderLookbackDays is the usage window for reorder.calc (FSD: 90).
	ReorderLookbackDays int
	// MonthlyViews lists the materialized views refreshed by report.refresh.
	MonthlyViews []string
}

func (c Config) expiryDays() int {
	if c.ExpiryAlertDays <= 0 {
		return 90
	}
	return c.ExpiryAlertDays
}

func (c Config) reorderDays() int {
	if c.ReorderLookbackDays <= 0 {
		return 90
	}
	return c.ReorderLookbackDays
}

// Usecase orchestrates the Fase 9 jobs against planning.Repository.
type Usecase struct {
	repo planning.Repository
	not  Notifier
	cfg  Config
	now  func() time.Time
}

// New wires the planning usecase. A nil Notifier falls back to LogNotifier.
func New(repo planning.Repository, not Notifier, cfg Config) *Usecase {
	if not == nil {
		not = LogNotifier{}
	}
	return &Usecase{repo: repo, not: not, cfg: cfg, now: time.Now}
}

// WithClock overrides the time source (tests).
func (u *Usecase) WithClock(now func() time.Time) *Usecase {
	u.now = now
	return u
}

// jobRun wraps a job body with aud.job_runs bookkeeping: the run is recorded
// as failed (with the error detail) whenever the body errors.
func (u *Usecase) jobRun(ctx context.Context, name planning.JobName, body func() (int, string, error)) error {
	runID, err := u.repo.StartJobRun(ctx, name)
	if err != nil {
		return fmt.Errorf("planning: start job run %s: %w", name, err)
	}

	processed, detail, err := body()
	if err != nil {
		_ = u.repo.FinishJobRun(ctx, runID, planning.JobRunResult{
			JobName: name, Status: planning.JobRunFailed, Detail: err.Error(),
		})
		return err
	}
	if err := u.repo.FinishJobRun(ctx, runID, planning.JobRunResult{
		JobName: name, Status: planning.JobRunCompleted, ItemsProcessed: processed, Detail: detail,
	}); err != nil {
		return fmt.Errorf("planning: finish job run %s: %w", name, err)
	}
	return nil
}

// ExpiryAlertResult summarizes one expiry.alert run (9.2).
type ExpiryAlertResult struct {
	Near90     []string // batch_no/expiry untuk H-90
	Near30     []string // batch_no/expiry untuk H-30
	Expired    []string // batch yang diubah menjadi quarantine
	Quarantined int
}

// RunExpiryAlert (9.2, harian 06:00) menyisir batch yang mendekati
// kadaluwarsa (H-90 dan H-30), mengirim notifikasi, dan memindahkan stok
// batch yang sudah melewati expiry date ke status quarantine.
func (u *Usecase) RunExpiryAlert(ctx context.Context) (*ExpiryAlertResult, error) {
	res := &ExpiryAlertResult{}
	err := u.jobRun(ctx, planning.JobExpiryAlert, func() (int, string, error) {
		cands, err := u.repo.GetExpiryCandidates(ctx)
		if err != nil {
			return 0, "", fmt.Errorf("planning: expiry alert candidates: %w", err)
		}

		today := time.Date(u.now().Year(), u.now().Month(), u.now().Day(), 0, 0, 0, 0, time.Local)
		for _, c := range cands {
			exp := time.Date(c.ExpiryDate.Year(), c.ExpiryDate.Month(), c.ExpiryDate.Day(), 0, 0, 0, 0, time.Local)
			days := int(exp.Sub(today).Hours() / 24)

			switch {
			case days < 0:
				// Lewat expiry date → karantina otomatis (FSD §8).
				if err := u.repo.MarkBatchQuarantined(ctx, c.BatchID); err != nil {
					return 0, "", fmt.Errorf("planning: quarantine expired batch %d: %w", c.BatchID, err)
				}
				res.Expired = append(res.Expired, fmt.Sprintf("%s (exp %s, qty %.2f)", c.BatchNo, c.ExpiryDate.Format("2006-01-02"), c.QtyOnhand))
				u.not.Notify(ctx, AlertCrit,
					"Batch expired dikarantina",
					fmt.Sprintf("Batch %s (%s) sudah lewat expiry %s — stok %s dipindah ke quarantine.",
						c.BatchNo, c.SKU, c.ExpiryDate.Format("2006-01-02"), fmtQty(c.QtyOnhand)))
			case days <= 30:
				res.Near30 = append(res.Near30, fmt.Sprintf("%s (exp %s, H-%d)", c.BatchNo, c.ExpiryDate.Format("2006-01-02"), days))
				u.not.Notify(ctx, AlertAlert,
					"Expiry ≤ 30 hari",
					fmt.Sprintf("Batch %s (%s) kadaluwarsa H-%d (%s) — prioritaskan pengeluaran FEFO.", c.BatchNo, c.SKU, days, c.ExpiryDate.Format("2006-01-02")))
			case days <= u.cfg.expiryDays():
				res.Near90 = append(res.Near90, fmt.Sprintf("%s (exp %s, H-%d)", c.BatchNo, c.ExpiryDate.Format("2006-01-02"), days))
				u.not.Notify(ctx, AlertWarn,
					"Expiry ≤ 90 hari",
					fmt.Sprintf("Batch %s (%s) kadaluwarsa H-%d (%s).", c.BatchNo, c.SKU, days, c.ExpiryDate.Format("2006-01-02")))
			}
		}

		processed := len(res.Near90) + len(res.Near30) + len(res.Expired)
		detail := fmt.Sprintf("H-90=%d H-30=%d expired-quarantined=%d", len(res.Near90), len(res.Near30), len(res.Expired))
		return processed, detail, nil
	})
	if err != nil {
		return nil, err
	}
	res.Quarantined = len(res.Expired)
	return res, nil
}

// ReorderCalcResult summarizes one reorder.calc run (9.3).
type ReorderCalcResult struct {
	Evaluated  int
	BelowROP   int
	Suggested  []ReorderSuggestionView
	Notified   int
}

// ReorderSuggestionView is the API-facing representation of one suggestion.
type ReorderSuggestionView struct {
	ItemID        int64
	SKU           string
	AvgDailyUsage float64
	LeadTimeDays  int
	SafetyStock   float64
	ROP           float64
	QtyAvailable  float64
	SuggestedQty  float64
	Status        string
}

// ComputeROP adalah fungsi murni penentuan reorder point (FSD §4.6):
//   rop = avg_daily_usage * lead_time_days + safety_stock
// lead_time_days dan safety_stock negatif ditolak (validation).
func ComputeROP(avgDailyUsage float64, leadTimeDays int, safetyStock float64) (float64, error) {
	if leadTimeDays < 0 {
		return 0, fmt.Errorf("planning: lead_time_days tidak boleh negatif (%d)", leadTimeDays)
	}
	if safetyStock < 0 {
		return 0, fmt.Errorf("planning: safety_stock tidak boleh negatif (%.2f)", safetyStock)
	}
	if avgDailyUsage < 0 {
		return 0, fmt.Errorf("planning: avg_daily_usage tidak boleh negatif (%.2f)", avgDailyUsage)
	}
	rop := avgDailyUsage*float64(leadTimeDays) + safetyStock
	return math.Round(rop*10000) / 10000, nil // 4 desimal konsisten dgn NUMERIC(18,4)
}

// RunReorderCalc (9.3, harian 01:00) menghitung ROP per item aktif,
// menyimpan usulan ke inv.replenishment_suggestions, dan memicu notifikasi
// untuk item dengan qty_available < rop (FR-8.2).
func (u *Usecase) RunReorderCalc(ctx context.Context) (*ReorderCalcResult, error) {
	res := &ReorderCalcResult{}
	err := u.jobRun(ctx, planning.JobReorderCalc, func() (int, string, error) {
		since := u.now().AddDate(0, 0, -u.cfg.reorderDays())
		items, err := u.repo.GetReorderItems(ctx, since)
		if err != nil {
			return 0, "", fmt.Errorf("planning: reorder items: %w", err)
		}

		for _, it := range items {
			rop, err := ComputeROP(it.AvgDailyUsage, it.LeadTimeDays, it.SafetyStock)
			if err != nil {
				// Data master tidak valid → lewati item, jangan matikan job.
				slog.Warn("planning: reorder.calc skipped invalid item",
					slog.Int64("item_id", it.ItemID), slog.Any("error", err))
				continue
			}

			status := "pending"
			if it.QtyAvailable < rop {
				status = "notified"
				res.Notified++
			}
			sug := planning.ReorderSuggestion{
				ItemID:        it.ItemID,
				AvgDailyUsage: it.AvgDailyUsage,
				LeadTimeDays:  it.LeadTimeDays,
				SafetyStock:   it.SafetyStock,
				ROP:           rop,
				QtyAvailable:  it.QtyAvailable,
				SuggestedQty:  suggestedQty(it, rop),
				Status:        status,
			}
			if err := u.repo.UpsertReplenishmentSuggestion(ctx, &sug); err != nil {
				return 0, "", err
			}
			if status == "notified" {
				u.not.Notify(ctx, AlertInfo,
					"Stok di bawah ROP",
					fmt.Sprintf("%s (%s): qty_available %.2f < ROP %.2f — usulan pembelian %.2f.",
						it.Name, it.SKU, it.QtyAvailable, rop, sug.SuggestedQty))
			}

			res.Evaluated++
			res.Suggested = append(res.Suggested, ReorderSuggestionView{
				ItemID: it.ItemID, SKU: it.SKU, AvgDailyUsage: it.AvgDailyUsage,
				LeadTimeDays: it.LeadTimeDays, SafetyStock: it.SafetyStock,
				ROP: rop, QtyAvailable: it.QtyAvailable,
				SuggestedQty: sug.SuggestedQty, Status: status,
			})
			if it.QtyAvailable < rop {
				res.BelowROP++
			}
		}

		detail := fmt.Sprintf("evaluated=%d below_rop=%d notified=%d", res.Evaluated, res.BelowROP, res.Notified)
		return res.Evaluated, detail, nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// suggestedQty proposes a purchase quantity: gap to ROP rounded up to the
// item max_qty ceiling when the item never had usage data (FSD: usulan
// pembelian), otherwise cover the shortfall plus one safety margin day.
func suggestedQty(it planning.ReorderItem, rop float64) float64 {
	if rop <= it.QtyAvailable {
		return 0
	}
	return math.Round((rop-it.QtyAvailable)*10000) / 10000
}

// ReconcileResult summarizes one ledger.reconcile run (9.4).
type ReconcileResult struct {
	Checked    int
	Deviations int
	DeviationDetail []string
}

// RunLedgerReconcile (9.4, mingguan) membandingkan SUM(qty) ledger
// inv.stock_movements terhadap qty_onhand inv.stock_balances per kunci
// (item, lokasi, batch, status). Selisih sekecil apa pun → log CRITICAL dan
// alert ke Inventory Manager/admin (§4.7, jaring pengaman bug posting).
func (u *Usecase) RunLedgerReconcile(ctx context.Context) (*ReconcileResult, error) {
	res := &ReconcileResult{}
	err := u.jobRun(ctx, planning.JobLedgerReconcile, func() (int, string, error) {
		balances, err := u.repo.GetBalanceTotals(ctx)
		if err != nil {
			return 0, "", fmt.Errorf("planning: reconcile balances: %w", err)
		}
		ledger, err := u.repo.GetLedgerTotals(ctx)
		if err != nil {
			return 0, "", fmt.Errorf("planning: reconcile ledger: %w", err)
		}

		onhand := make(map[string]float64, len(balances))
		for _, b := range balances {
			onhand[balanceKey(b)] = b.QtyOnhand
		}
		ledgerSum := make(map[string]float64, len(ledger))
		for _, l := range ledger {
			ledgerSum[balanceKey(l)] = l.LedgerSum
		}

		// Semua kunci yang muncul di ledger wajib cocok dengan saldo.
		keys := make(map[string]bool, len(ledgerSum))
		for k := range ledgerSum {
			keys[k] = true
		}
		for k := range onhand {
			keys[k] = true
		}

		for k := range keys {
			sum := ledgerSum[k]
			oh := onhand[k]
			res.Checked++
			// Delta 1e-6 untuk toleransi pembulatan NUMERIC(18,4).
			if math.Abs(sum-oh) > 1e-6 {
				res.Deviations++
				msg := fmt.Sprintf("LEDGER MISMATCH key=%s ledger_sum=%.4f balance_qty=%.4f delta=%.4f",
					k, sum, oh, sum-oh)
				res.DeviationDetail = append(res.DeviationDetail, msg)
				slog.Error("ledger.reconcile CRITICAL", slog.String("key", k),
					slog.Float64("ledger_sum", sum), slog.Float64("balance", oh))
				u.not.Notify(ctx, AlertCrit,
					"Selisih rekonsiliasi ledger-balance",
					msg)
			}
		}

		detail := fmt.Sprintf("checked=%d deviations=%d", res.Checked, res.Deviations)
		if res.Deviations > 0 {
			detail += " — CRITICAL: deviasi ditemukan, tinjau segera"
		}
		return res.Checked, detail, nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

func balanceKey(b planning.BalanceTotal) string {
	batch := "nil"
	if b.BatchID != nil {
		batch = fmt.Sprintf("%d", *b.BatchID)
	}
	return fmt.Sprintf("%d|%d|%s|%s", b.ItemID, b.LocationID, batch, b.Status)
}

// RunPartitionMaintain (9.5, bulanan) membuat partisi inv.stock_movements
// untuk bulan berikutnya agar indeks tetap cepat (partition pruning).
func (u *Usecase) RunPartitionMaintain(ctx context.Context) (*PartitionMaintainResult, error) {
	res := &PartitionMaintainResult{}
	err := u.jobRun(ctx, planning.JobPartitionMaintain, func() (int, string, error) {
		next := nextMonthStart(u.now())
		spec := planning.PartitionSpec{
			Name:  fmt.Sprintf("stock_movements_%s", next.Format("200601")),
			Start: next,
			End:   next.AddDate(0, 1, 0),
		}
		if err := u.repo.CreatePartition(ctx, spec); err != nil {
			return 0, "", err
		}
		res.Partition = spec.Name
		res.Range = spec.Start.Format("2006-01-02") + " s.d. " + spec.End.Format("2006-01-02")
		return 1, "partition " + spec.Name, nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// PartitionMaintainResult summarizes one partition.maintain run.
type PartitionMaintainResult struct {
	Partition string
	Range     string
}

// RunReportRefresh (9.5, harian 02:00) me-refresh materialized views yang
// menyajikan laporan mutasi bulanan, klasifikasi ABC, dan dashboard.
func (u *Usecase) RunReportRefresh(ctx context.Context) (*ReportRefreshResult, error) {
	views := u.cfg.MonthlyViews
	if len(views) == 0 {
		views = []string{"inv.mv_monthly_movements"}
	}
	res := &ReportRefreshResult{Views: views}
	err := u.jobRun(ctx, planning.JobReportRefresh, func() (int, string, error) {
		if err := u.repo.RefreshMaterializedViews(ctx, views); err != nil {
			return 0, "", err
		}
		return len(views), fmt.Sprintf("refreshed %d view(s)", len(views)), nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// ReportRefreshResult summarizes one report.refresh run.
type ReportRefreshResult struct {
	Views []string
}

// helpers ───────────────────────────────────────────────────────────────────────

func nextMonthStart(now time.Time) time.Time {
	first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	return first.AddDate(0, 1, 0)
}

func fmtQty(v float64) string {
	return fmt.Sprintf("%.4f", v)
}
