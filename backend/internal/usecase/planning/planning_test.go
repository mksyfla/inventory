package planning_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	dplan "inventory/internal/domain/planning"
	"inventory/internal/usecase/planning"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── mocks ─────────────────────────────────────────────────────────────────────

type mockRepo struct {
	expiryCands []dplan.ExpiryCandidate
	expiryErr   error
	markErr     error
	marked      []int64

	reorderItems []dplan.ReorderItem
	reorderErr   error
	upsertErr    error
	upserts      []dplan.ReorderSuggestion

	balances  []dplan.BalanceTotal
	balanceErr error
	ledger    []dplan.BalanceTotal
	ledgerErr error

	partErr   error
	partition dplan.PartitionSpec

	refreshErr error
	refreshed  []string

	startErr  error
	finishErr error
	runs      []dplan.JobRunResult
}

func (m *mockRepo) GetExpiryCandidates(context.Context) ([]dplan.ExpiryCandidate, error) {
	return m.expiryCands, m.expiryErr
}
func (m *mockRepo) MarkBatchQuarantined(_ context.Context, batchID int64) error {
	m.marked = append(m.marked, batchID)
	return m.markErr
}
func (m *mockRepo) GetReorderItems(context.Context, time.Time) ([]dplan.ReorderItem, error) {
	return m.reorderItems, m.reorderErr
}
func (m *mockRepo) UpsertReplenishmentSuggestion(_ context.Context, s *dplan.ReorderSuggestion) error {
	m.upserts = append(m.upserts, *s)
	return m.upsertErr
}
func (m *mockRepo) GetBalanceTotals(context.Context) ([]dplan.BalanceTotal, error) {
	return m.balances, m.balanceErr
}
func (m *mockRepo) GetLedgerTotals(context.Context) ([]dplan.BalanceTotal, error) {
	return m.ledger, m.ledgerErr
}
func (m *mockRepo) CreatePartition(_ context.Context, spec dplan.PartitionSpec) error {
	m.partition = spec
	return m.partErr
}
func (m *mockRepo) RefreshMaterializedViews(_ context.Context, names []string) error {
	m.refreshed = names
	return m.refreshErr
}
func (m *mockRepo) StartJobRun(context.Context, dplan.JobName) (int64, error) {
	if m.startErr != nil {
		return 0, m.startErr
	}
	return 1, nil
}
func (m *mockRepo) FinishJobRun(_ context.Context, id int64, res dplan.JobRunResult) error {
	m.runs = append(m.runs, res)
	return m.finishErr
}

type notifyCall struct {
	level   planning.AlertLevel
	title   string
	message string
}

type mockNotifier struct {
	calls []notifyCall
}

func (m *mockNotifier) Notify(_ context.Context, level planning.AlertLevel, title, message string) {
	m.calls = append(m.calls, notifyCall{level: level, title: title, message: message})
}

// ─── harness ───────────────────────────────────────────────────────────────────

var fixedNow = time.Date(2026, 8, 15, 10, 30, 0, 0, time.UTC)

type harness struct {
	repo *mockRepo
	not  *mockNotifier
	uc   *planning.Usecase
}

func newHarness(t *testing.T, cfg planning.Config) *harness {
	t.Helper()
	h := &harness{
		repo: &mockRepo{},
		not:  &mockNotifier{},
	}
	h.uc = planning.New(h.repo, h.not, cfg).WithClock(func() time.Time { return fixedNow })
	return h
}

func (h *harness) completedRuns(t *testing.T, name dplan.JobName) []dplan.JobRunResult {
	t.Helper()
	var out []dplan.JobRunResult
	for _, r := range h.repo.runs {
		if r.JobName == name {
			out = append(out, r)
		}
	}
	return out
}

func bPtr(v int64) *int64 { return &v }

// ─── ComputeROP (fungsi murni, FSD §4.6 / 10.1) ────────────────────────────────

func TestComputeROP_Formula(t *testing.T) {
	// rop = avg_daily_usage * lead_time_days + safety_stock
	rop, err := planning.ComputeROP(3.5, 7, 10)
	require.NoError(t, err)
	assert.Equal(t, 34.5, rop) // 3.5*7 + 10

	rop, err = planning.ComputeROP(0, 7, 10)
	require.NoError(t, err)
	assert.Equal(t, 10.0, rop) // tanpa pemakaian → ROP = safety stock
}

func TestComputeROP_Rounding(t *testing.T) {
	rop, err := planning.ComputeROP(1.0/3.0, 1, 0)
	require.NoError(t, err)
	assert.Equal(t, 0.3333, rop) // 4 desimal
}

func TestComputeROP_Validation(t *testing.T) {
	_, err := planning.ComputeROP(1, -1, 0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "lead_time_days")

	_, err = planning.ComputeROP(1, 0, -5)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "safety_stock")

	_, err = planning.ComputeROP(-2, 0, 0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "avg_daily_usage")
}

// ─── 9.2 expiry.alert ──────────────────────────────────────────────────────────

func TestRunExpiryAlert_BucketsAndQuarantine(t *testing.T) {
	h := newHarness(t, planning.Config{})
	// today = 2026-08-15
	h.repo.expiryCands = []dplan.ExpiryCandidate{
		{BatchID: 1, BatchNo: "B-H90", SKU: "SKU-A", ExpiryDate: fixedNow.AddDate(0, 0, 45), QtyOnhand: 100},
		{BatchID: 2, BatchNo: "B-H30", SKU: "SKU-B", ExpiryDate: fixedNow.AddDate(0, 0, 10), QtyOnhand: 50},
		{BatchID: 3, BatchNo: "B-EXP", SKU: "SKU-C", ExpiryDate: fixedNow.AddDate(0, 0, -5), QtyOnhand: 20},
	}

	res, err := h.uc.RunExpiryAlert(context.Background())
	require.NoError(t, err)
	assert.Len(t, res.Near90, 1)
	assert.Len(t, res.Near30, 1)
	assert.Len(t, res.Expired, 1)
	assert.Equal(t, 1, res.Quarantined)
	assert.Equal(t, []int64{3}, h.repo.marked)

	runs := h.completedRuns(t, dplan.JobExpiryAlert)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunCompleted, runs[0].Status)
	assert.Equal(t, 3, runs[0].ItemsProcessed)
	assert.Contains(t, runs[0].Detail, "H-90=1 H-30=1 expired-quarantined=1")

	// notifikasi: H-90 warn, H-30 alert, expired critical
	require.Len(t, h.not.calls, 3)
	assert.Equal(t, planning.AlertWarn, h.not.calls[0].level)
	assert.Equal(t, planning.AlertAlert, h.not.calls[1].level)
	assert.Equal(t, planning.AlertCrit, h.not.calls[2].level)
	assert.Contains(t, h.not.calls[2].message, "B-EXP")
}

func TestRunExpiryAlert_BeyondWindowIgnored(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.expiryCands = []dplan.ExpiryCandidate{
		{BatchID: 9, BatchNo: "B-FAR", ExpiryDate: fixedNow.AddDate(0, 0, 200), QtyOnhand: 5},
	}
	res, err := h.uc.RunExpiryAlert(context.Background())
	require.NoError(t, err)
	assert.Empty(t, res.Near90)
	assert.Empty(t, res.Near30)
	assert.Empty(t, res.Expired)
	assert.Empty(t, h.not.calls)
	runs := h.completedRuns(t, dplan.JobExpiryAlert)
	require.Len(t, runs, 1)
	assert.Equal(t, 0, runs[0].ItemsProcessed)
}

func TestRunExpiryAlert_NoCandidates(t *testing.T) {
	h := newHarness(t, planning.Config{})
	res, err := h.uc.RunExpiryAlert(context.Background())
	require.NoError(t, err)
	assert.Empty(t, res.Near90)
	assert.Zero(t, res.Quarantined)
}

func TestRunExpiryAlert_CandidatesError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.expiryErr = fmt.Errorf("db down")
	_, err := h.uc.RunExpiryAlert(context.Background())
	require.Error(t, err)
	runs := h.completedRuns(t, dplan.JobExpiryAlert)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunFailed, runs[0].Status)
	assert.Contains(t, runs[0].Detail, "db down")
}

func TestRunExpiryAlert_QuarantineError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.expiryCands = []dplan.ExpiryCandidate{
		{BatchID: 3, BatchNo: "B-EXP", ExpiryDate: fixedNow.AddDate(0, 0, -1)},
	}
	h.repo.markErr = fmt.Errorf("constraint violation")
	_, err := h.uc.RunExpiryAlert(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "quarantine")
	runs := h.completedRuns(t, dplan.JobExpiryAlert)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunFailed, runs[0].Status)
}

func TestRunExpiryAlert_StartRunError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.startErr = fmt.Errorf("job_runs missing")
	_, err := h.uc.RunExpiryAlert(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "start job run")
}

func TestRunExpiryAlert_FinishRunError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.finishErr = fmt.Errorf("audit fail")
	_, err := h.uc.RunExpiryAlert(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "finish job run")
}

func TestRunExpiryAlert_CustomWindow(t *testing.T) {
	h := newHarness(t, planning.Config{ExpiryAlertDays: 45})
	h.repo.expiryCands = []dplan.ExpiryCandidate{
		{BatchID: 1, BatchNo: "B-60D", ExpiryDate: fixedNow.AddDate(0, 0, 60)}, // > 45 → lewat window
		{BatchID: 2, BatchNo: "B-30D", ExpiryDate: fixedNow.AddDate(0, 0, 30)}, // <= 45 → H-30 bucket (<=30)... 30 → Near30
	}
	res, err := h.uc.RunExpiryAlert(context.Background())
	require.NoError(t, err)
	assert.Empty(t, res.Near90) // B-60D di luar window 45 hari
	assert.Len(t, res.Near30, 1)
}

// ─── 9.3 reorder.calc (FR-8.2) ─────────────────────────────────────────────────

func TestRunReorderCalc_BelowAndAboveROP(t *testing.T) {
	h := newHarness(t, planning.Config{})
	// item 1: usage 180/90 = 2.0/hari, lead 7, safety 10 → ROP 24; avail 10 < 24 → notified
	// item 2: usage 90/90 = 1.0/hari, lead 3, safety 0 → ROP 3; avail 100 > 3 → pending
	h.repo.reorderItems = []dplan.ReorderItem{
		{ItemID: 1, SKU: "SKU-A", Name: "A", AvgDailyUsage: 2, LeadTimeDays: 7, SafetyStock: 10, QtyAvailable: 10},
		{ItemID: 2, SKU: "SKU-B", Name: "B", AvgDailyUsage: 1, LeadTimeDays: 3, SafetyStock: 0, QtyAvailable: 100},
	}

	res, err := h.uc.RunReorderCalc(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 2, res.Evaluated)
	assert.Equal(t, 1, res.BelowROP)
	assert.Equal(t, 1, res.Notified)

	require.Len(t, h.repo.upserts, 2)
	assert.Equal(t, 24.0, h.repo.upserts[0].ROP)
	assert.Equal(t, "notified", h.repo.upserts[0].Status)
	assert.Equal(t, 14.0, h.repo.upserts[0].SuggestedQty) // 24 - 10
	assert.Equal(t, 3.0, h.repo.upserts[1].ROP)
	assert.Equal(t, "pending", h.repo.upserts[1].Status)
	assert.Equal(t, 0.0, h.repo.upserts[1].SuggestedQty)

	// notifikasi hanya untuk item di bawah ROP
	require.Len(t, h.not.calls, 1)
	assert.Contains(t, h.not.calls[0].message, "SKU-A")

	runs := h.completedRuns(t, dplan.JobReorderCalc)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunCompleted, runs[0].Status)
	assert.Equal(t, 2, runs[0].ItemsProcessed)
}

func TestRunReorderCalc_NoUsageROPIsSafetyStock(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.reorderItems = []dplan.ReorderItem{
		{ItemID: 5, SKU: "SKU-E", AvgDailyUsage: 0, LeadTimeDays: 5, SafetyStock: 8, QtyAvailable: 3},
	}
	res, err := h.uc.RunReorderCalc(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, res.BelowROP)
	require.Len(t, h.repo.upserts, 1)
	assert.Equal(t, 8.0, h.repo.upserts[0].ROP) // 0*5 + 8
	assert.Equal(t, 5.0, h.repo.upserts[0].SuggestedQty)
}

func TestRunReorderCalc_InvalidMasterDataSkipped(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.reorderItems = []dplan.ReorderItem{
		{ItemID: 1, SKU: "BAD", AvgDailyUsage: 1, LeadTimeDays: -2, SafetyStock: 0}, // lead negatif
		{ItemID: 2, SKU: "OK", AvgDailyUsage: 1, LeadTimeDays: 2, SafetyStock: 0},
	}
	res, err := h.uc.RunReorderCalc(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, res.Evaluated) // item invalid dilewati tanpa mematikan job
	assert.Len(t, res.Suggested, 1)
	assert.Equal(t, int64(2), res.Suggested[0].ItemID)
	assert.Len(t, h.repo.upserts, 1)
}

func TestRunReorderCalc_ItemsError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.reorderErr = fmt.Errorf("query timeout")
	_, err := h.uc.RunReorderCalc(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "reorder items")
	runs := h.completedRuns(t, dplan.JobReorderCalc)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunFailed, runs[0].Status)
}

func TestRunReorderCalc_UpsertError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.reorderItems = []dplan.ReorderItem{
		{ItemID: 1, SKU: "SKU-A", AvgDailyUsage: 1, LeadTimeDays: 1, SafetyStock: 0, QtyAvailable: 5},
	}
	h.repo.upsertErr = fmt.Errorf("duplicate key")
	_, err := h.uc.RunReorderCalc(context.Background())
	require.Error(t, err)
}

func TestRunReorderCalc_NilNotifier(t *testing.T) {
	// Notifier nil → LogNotifier fallback, tidak panic.
	repo := &mockRepo{}
	repo.reorderItems = []dplan.ReorderItem{
		{ItemID: 1, SKU: "SKU-A", AvgDailyUsage: 2, LeadTimeDays: 7, SafetyStock: 10, QtyAvailable: 10},
	}
	plain := planning.New(repo, nil, planning.Config{}).WithClock(func() time.Time { return fixedNow })
	res, err := plain.RunReorderCalc(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, res.Notified)
}

// ─── 9.4 ledger.reconcile (§4.7) ───────────────────────────────────────────────

func TestRunLedgerReconcile_InSync(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.balances = []dplan.BalanceTotal{
		{ItemID: 1, LocationID: 1, BatchID: nil, Status: "available", QtyOnhand: 50},
		{ItemID: 2, LocationID: 1, BatchID: bPtr(7), Status: "available", QtyOnhand: 30},
	}
	h.repo.ledger = []dplan.BalanceTotal{
		{ItemID: 1, LocationID: 1, Status: "available", LedgerSum: 50},
		{ItemID: 2, LocationID: 1, BatchID: bPtr(7), Status: "available", LedgerSum: 30},
	}

	res, err := h.uc.RunLedgerReconcile(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 2, res.Checked)
	assert.Zero(t, res.Deviations)
	assert.Empty(t, h.not.calls) // tidak ada alert

	runs := h.completedRuns(t, dplan.JobLedgerReconcile)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunCompleted, runs[0].Status)
	assert.NotContains(t, runs[0].Detail, "CRITICAL")
}

func TestRunLedgerReconcile_MismatchCritical(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.balances = []dplan.BalanceTotal{
		{ItemID: 1, LocationID: 1, Status: "available", QtyOnhand: 45},
	}
	h.repo.ledger = []dplan.BalanceTotal{
		{ItemID: 1, LocationID: 1, Status: "available", LedgerSum: 50}, // selisih -5
	}

	res, err := h.uc.RunLedgerReconcile(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, res.Deviations)
	require.Len(t, res.DeviationDetail, 1)
	assert.Contains(t, res.DeviationDetail[0], "LEDGER MISMATCH")

	require.Len(t, h.not.calls, 1)
	assert.Equal(t, planning.AlertCrit, h.not.calls[0].level)

	runs := h.completedRuns(t, dplan.JobLedgerReconcile)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunCompleted, runs[0].Status) // job selesai; temuan dilaporkan
	assert.Contains(t, runs[0].Detail, "CRITICAL")
}

func TestRunLedgerReconcile_BalanceWithoutLedger(t *testing.T) {
	h := newHarness(t, planning.Config{})
	// saldo 10 tapi tidak ada mutasi sama sekali → deviasi (bug posting).
	h.repo.balances = []dplan.BalanceTotal{
		{ItemID: 1, LocationID: 1, Status: "available", QtyOnhand: 10},
	}
	res, err := h.uc.RunLedgerReconcile(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, res.Deviations)
}

func TestRunLedgerReconcile_LedgerWithoutBalance(t *testing.T) {
	h := newHarness(t, planning.Config{})
	// mutasi tercatat tapi saldo hilang → deviasi.
	h.repo.ledger = []dplan.BalanceTotal{
		{ItemID: 3, LocationID: 2, BatchID: bPtr(4), Status: "quarantine", LedgerSum: 7},
	}
	res, err := h.uc.RunLedgerReconcile(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, res.Deviations)
}

func TestRunLedgerReconcile_BalancesError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.balanceErr = fmt.Errorf("db error")
	_, err := h.uc.RunLedgerReconcile(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "balances")
	runs := h.completedRuns(t, dplan.JobLedgerReconcile)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunFailed, runs[0].Status)
}

func TestRunLedgerReconcile_LedgerError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.ledgerErr = fmt.Errorf("partition missing")
	_, err := h.uc.RunLedgerReconcile(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ledger")
}

// ─── 9.5 partition.maintain & report.refresh ───────────────────────────────────

func TestRunPartitionMaintain_CreatesNextMonth(t *testing.T) {
	h := newHarness(t, planning.Config{})
	// fixedNow = 2026-08-15 → partisi September 2026
	res, err := h.uc.RunPartitionMaintain(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "stock_movements_202609", res.Partition)
	assert.Equal(t, "stock_movements_202609", h.repo.partition.Name)
	assert.Equal(t, "2026-09-01", h.repo.partition.Start.Format("2006-01-02"))
	assert.Equal(t, "2026-10-01", h.repo.partition.End.Format("2006-01-02"))

	runs := h.completedRuns(t, dplan.JobPartitionMaintain)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunCompleted, runs[0].Status)
	assert.Equal(t, 1, runs[0].ItemsProcessed)
}

func TestRunPartitionMaintain_CreateError(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.partErr = fmt.Errorf("permission denied")
	_, err := h.uc.RunPartitionMaintain(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "permission denied")
	runs := h.completedRuns(t, dplan.JobPartitionMaintain)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunFailed, runs[0].Status)
}

func TestRunReportRefresh_DefaultViews(t *testing.T) {
	h := newHarness(t, planning.Config{})
	res, err := h.uc.RunReportRefresh(context.Background())
	require.NoError(t, err)
	assert.Equal(t, []string{"inv.mv_monthly_movements"}, res.Views)
	assert.Equal(t, []string{"inv.mv_monthly_movements"}, h.repo.refreshed)

	runs := h.completedRuns(t, dplan.JobReportRefresh)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunCompleted, runs[0].Status)
	assert.Equal(t, 1, runs[0].ItemsProcessed)
}

func TestRunReportRefresh_CustomViews(t *testing.T) {
	h := newHarness(t, planning.Config{
		MonthlyViews: []string{"inv.mv_monthly_movements", "inv.mv_abc_classification"},
	})
	res, err := h.uc.RunReportRefresh(context.Background())
	require.NoError(t, err)
	assert.Len(t, res.Views, 2)
	assert.Len(t, h.repo.refreshed, 2)
}

func TestRunReportRefresh_Error(t *testing.T) {
	h := newHarness(t, planning.Config{})
	h.repo.refreshErr = fmt.Errorf("view locked")
	_, err := h.uc.RunReportRefresh(context.Background())
	require.Error(t, err)
	runs := h.completedRuns(t, dplan.JobReportRefresh)
	require.Len(t, runs, 1)
	assert.Equal(t, dplan.JobRunFailed, runs[0].Status)
}
