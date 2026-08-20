package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"inventory/internal/pkg/logger"
	planninguc "inventory/internal/usecase/planning"

	"github.com/hibiken/asynq"
)

// Fase 9 task types (FSD §8 — Background Job & Penjadwalan).
const (
	TypeExpiryAlert       = "expiry.alert"
	TypeReorderCalc       = "reorder.calc"
	TypeLedgerReconcile   = "ledger.reconcile"
	TypePartitionMaintain = "partition.maintain"
	TypeReportRefresh     = "report.refresh"
)

// PlanningWorker adapts the planning usecase to asynq task handlers.
type PlanningWorker struct {
	uc *planninguc.Usecase
}

// NewPlanningWorker wires the planning usecase onto asynq handlers.
func NewPlanningWorker(uc *planninguc.Usecase) *PlanningWorker {
	return &PlanningWorker{uc: uc}
}

// emptyPayload is the (future-proof) payload shape for scheduled jobs.
type emptyPayload struct{}

func parseEmptyPayload(t *asynq.Task) error {
	if len(t.Payload()) == 0 {
		return nil
	}
	var p emptyPayload
	return json.Unmarshal(t.Payload(), &p)
}

// HandleExpiryAlert runs the daily 06:00 expiry.alert job (9.2).
func (w *PlanningWorker) HandleExpiryAlert(ctx context.Context, t *asynq.Task) error {
	if err := parseEmptyPayload(t); err != nil {
		return fmt.Errorf("worker: expiry.alert bad payload: %w", err)
	}
	res, err := w.uc.RunExpiryAlert(ctx)
	if err != nil {
		return fmt.Errorf("worker: expiry.alert failed: %w", err)
	}
	logger.Info(ctx, "expiry.alert completed",
		slog.Int("h90", len(res.Near90)),
		slog.Int("h30", len(res.Near30)),
		slog.Int("quarantined", res.Quarantined))
	return nil
}

// HandleReorderCalc runs the daily 01:00 reorder.calc job (9.3, FR-8.2).
func (w *PlanningWorker) HandleReorderCalc(ctx context.Context, t *asynq.Task) error {
	if err := parseEmptyPayload(t); err != nil {
		return fmt.Errorf("worker: reorder.calc bad payload: %w", err)
	}
	res, err := w.uc.RunReorderCalc(ctx)
	if err != nil {
		return fmt.Errorf("worker: reorder.calc failed: %w", err)
	}
	logger.Info(ctx, "reorder.calc completed",
		slog.Int("evaluated", res.Evaluated),
		slog.Int("below_rop", res.BelowROP),
		slog.Int("notified", res.Notified))
	return nil
}

// HandleLedgerReconcile runs the weekly ledger.reconcile job (9.4, §4.7).
func (w *PlanningWorker) HandleLedgerReconcile(ctx context.Context, t *asynq.Task) error {
	if err := parseEmptyPayload(t); err != nil {
		return fmt.Errorf("worker: ledger.reconcile bad payload: %w", err)
	}
	res, err := w.uc.RunLedgerReconcile(ctx)
	if err != nil {
		return fmt.Errorf("worker: ledger.reconcile failed: %w", err)
	}
	logger.Info(ctx, "ledger.reconcile completed",
		slog.Int("checked", res.Checked),
		slog.Int("deviations", res.Deviations))
	return nil
}

// HandlePartitionMaintain runs the monthly partition.maintain job (9.5).
func (w *PlanningWorker) HandlePartitionMaintain(ctx context.Context, t *asynq.Task) error {
	if err := parseEmptyPayload(t); err != nil {
		return fmt.Errorf("worker: partition.maintain bad payload: %w", err)
	}
	res, err := w.uc.RunPartitionMaintain(ctx)
	if err != nil {
		return fmt.Errorf("worker: partition.maintain failed: %w", err)
	}
	logger.Info(ctx, "partition.maintain completed",
		slog.String("partition", res.Partition),
		slog.String("range", res.Range))
	return nil
}

// HandleReportRefresh runs the daily 02:00 report.refresh job (9.5).
func (w *PlanningWorker) HandleReportRefresh(ctx context.Context, t *asynq.Task) error {
	if err := parseEmptyPayload(t); err != nil {
		return fmt.Errorf("worker: report.refresh bad payload: %w", err)
	}
	res, err := w.uc.RunReportRefresh(ctx)
	if err != nil {
		return fmt.Errorf("worker: report.refresh failed: %w", err)
	}
	logger.Info(ctx, "report.refresh completed", slog.Int("views", len(res.Views)))
	return nil
}

// ServeMuxDeps carries the optional usecases wired by NewServeMux. When a
// planning usecase is absent, only the legacy import task is registered.
type ServeMuxDeps struct {
	Planning *planninguc.Usecase
}

// NewServeMux wires all task handlers and returns a ready asynq.ServeMux.
// The variadic deps keep existing callers (import-only workers) compiling:
// with no deps, the import:sku handler is registered as before.
func NewServeMux(deps ...ServeMuxDeps) *asynq.ServeMux {
	mux := asynq.NewServeMux()
	mux.HandleFunc(TypeImportSKU, HandleImportSKUTask)

	if len(deps) > 0 && deps[0].Planning != nil {
		w := NewPlanningWorker(deps[0].Planning)
		mux.HandleFunc(TypeExpiryAlert, w.HandleExpiryAlert)
		mux.HandleFunc(TypeReorderCalc, w.HandleReorderCalc)
		mux.HandleFunc(TypeLedgerReconcile, w.HandleLedgerReconcile)
		mux.HandleFunc(TypePartitionMaintain, w.HandlePartitionMaintain)
		mux.HandleFunc(TypeReportRefresh, w.HandleReportRefresh)
	}
	return mux
}
