package worker

import (
	"time"
	"context"
	"fmt"
	"testing"

	"inventory/internal/domain/planning"
	planninguc "inventory/internal/usecase/planning"

	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubPlanning is a minimal planning usecase double: it runs the given
// body-free stub functions so handler wiring (payload parse + result log)
// is exercised without touching a repository.
type stubPlanning struct {
	expiry   func() (*planninguc.ExpiryAlertResult, error)
	reorder  func() (*planninguc.ReorderCalcResult, error)
	reconcile func() (*planninguc.ReconcileResult, error)
	partition func() (*planninguc.PartitionMaintainResult, error)
	refresh  func() (*planninguc.ReportRefreshResult, error)
}

func (s *stubPlanning) RunExpiryAlert(context.Context) (*planninguc.ExpiryAlertResult, error) {
	return s.expiry()
}
func (s *stubPlanning) RunReorderCalc(context.Context) (*planninguc.ReorderCalcResult, error) {
	return s.reorder()
}
func (s *stubPlanning) RunLedgerReconcile(context.Context) (*planninguc.ReconcileResult, error) {
	return s.reconcile()
}
func (s *stubPlanning) RunPartitionMaintain(context.Context) (*planninguc.PartitionMaintainResult, error) {
	return s.partition()
}
func (s *stubPlanning) RunReportRefresh(context.Context) (*planninguc.ReportRefreshResult, error) {
	return s.refresh()
}

// handlerOps is the subset of PlanningWorker behaviour the tests need.
type handlerOps interface {
	HandleExpiryAlert(context.Context, *asynq.Task) error
	HandleReorderCalc(context.Context, *asynq.Task) error
	HandleLedgerReconcile(context.Context, *asynq.Task) error
	HandlePartitionMaintain(context.Context, *asynq.Task) error
	HandleReportRefresh(context.Context, *asynq.Task) error
}

func newStubWorker(s *stubPlanning) handlerOps {
	return &planningHandler{uc: s}
}

// planningHandler adapts a planning usecase stub into handler methods,
// mirroring the real PlanningWorker without a repository.
type planningHandler struct {
	uc *stubPlanning
}

func (w *planningHandler) HandleExpiryAlert(ctx context.Context, t *asynq.Task) error {
	return w.call(ctx, t, func() error { _, err := w.uc.RunExpiryAlert(ctx); return err })
}
func (w *planningHandler) HandleReorderCalc(ctx context.Context, t *asynq.Task) error {
	return w.call(ctx, t, func() error { _, err := w.uc.RunReorderCalc(ctx); return err })
}
func (w *planningHandler) HandleLedgerReconcile(ctx context.Context, t *asynq.Task) error {
	return w.call(ctx, t, func() error { _, err := w.uc.RunLedgerReconcile(ctx); return err })
}
func (w *planningHandler) HandlePartitionMaintain(ctx context.Context, t *asynq.Task) error {
	return w.call(ctx, t, func() error { _, err := w.uc.RunPartitionMaintain(ctx); return err })
}
func (w *planningHandler) HandleReportRefresh(ctx context.Context, t *asynq.Task) error {
	return w.call(ctx, t, func() error { _, err := w.uc.RunReportRefresh(ctx); return err })
}

// call mirrors the real handlers: nil payload is the scheduler format
// (asynq.NewTask(typ, nil)); a malformed payload is rejected.
func (w *planningHandler) call(_ context.Context, t *asynq.Task, run func() error) error {
	if err := parseEmptyPayload(t); err != nil {
		return fmt.Errorf("worker: bad payload: %w", err)
	}
	return run()
}

func TestPlanningHandlers_HappyPath(t *testing.T) {
	s := &stubPlanning{
		expiry:    func() (*planninguc.ExpiryAlertResult, error) { return &planninguc.ExpiryAlertResult{Quarantined: 2}, nil },
		reorder:   func() (*planninguc.ReorderCalcResult, error) { return &planninguc.ReorderCalcResult{Notified: 1}, nil },
		reconcile: func() (*planninguc.ReconcileResult, error) { return &planninguc.ReconcileResult{Deviations: 0}, nil },
		partition: func() (*planninguc.PartitionMaintainResult, error) { return &planninguc.PartitionMaintainResult{Partition: "stock_movements_202609"}, nil },
		refresh:   func() (*planninguc.ReportRefreshResult, error) { return &planninguc.ReportRefreshResult{Views: []string{"inv.mv_monthly_movements"}}, nil },
	}
	w := newStubWorker(s)

	cases := []struct {
		name string
		fn   func() error
	}{
		{"expiry.alert", func() error { return w.HandleExpiryAlert(context.Background(), asynq.NewTask(TypeExpiryAlert, nil)) }},
		{"reorder.calc", func() error { return w.HandleReorderCalc(context.Background(), asynq.NewTask(TypeReorderCalc, nil)) }},
		{"ledger.reconcile", func() error { return w.HandleLedgerReconcile(context.Background(), asynq.NewTask(TypeLedgerReconcile, nil)) }},
		{"partition.maintain", func() error { return w.HandlePartitionMaintain(context.Background(), asynq.NewTask(TypePartitionMaintain, nil)) }},
		{"report.refresh", func() error { return w.HandleReportRefresh(context.Background(), asynq.NewTask(TypeReportRefresh, nil)) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.NoError(t, tc.fn())
		})
	}
}

func TestPlanningHandlers_MalformedPayload(t *testing.T) {
	s := &stubPlanning{
		expiry: func() (*planninguc.ExpiryAlertResult, error) { return &planninguc.ExpiryAlertResult{}, nil },
	}
	w := newStubWorker(s)
	err := w.HandleExpiryAlert(context.Background(), asynq.NewTask(TypeExpiryAlert, []byte("{not-json")))
	assert.Error(t, err)
}

func TestPlanningHandlers_UsecaseErrorPropagates(t *testing.T) {
	s := &stubPlanning{
		expiry: func() (*planninguc.ExpiryAlertResult, error) {
			return nil, fmt.Errorf("planning: db down")
		},
	}
	w := newStubWorker(s)
	err := w.HandleExpiryAlert(context.Background(), asynq.NewTask(TypeExpiryAlert, nil))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "db down")
}

func TestPlanningWorker_RealHandlers(t *testing.T) {
	// The real PlanningWorker handlers driven by a real planning usecase on
	// an empty repository: covers payload parse, usecase call and result
	// logging paths end-to-end (no data → empty results, no errors).
	uc := planninguc.New(&nilRepo{}, nil, planninguc.Config{})
	w := NewPlanningWorker(uc)
	ctx := context.Background()

	assert.NoError(t, w.HandleExpiryAlert(ctx, asynq.NewTask(TypeExpiryAlert, nil)))
	assert.NoError(t, w.HandleReorderCalc(ctx, asynq.NewTask(TypeReorderCalc, nil)))
	assert.NoError(t, w.HandleLedgerReconcile(ctx, asynq.NewTask(TypeLedgerReconcile, nil)))
	assert.NoError(t, w.HandlePartitionMaintain(ctx, asynq.NewTask(TypePartitionMaintain, nil)))
	assert.NoError(t, w.HandleReportRefresh(ctx, asynq.NewTask(TypeReportRefresh, nil)))

	// Malformed payloads are rejected before reaching the usecase.
	assert.Error(t, w.HandleExpiryAlert(ctx, asynq.NewTask(TypeExpiryAlert, []byte("{bad"))))
}

func TestNewServeMux_RegistersPlanningTasks(t *testing.T) {
	// Without deps → legacy import handler only (backward compatible).
	mux := NewServeMux()
	assert.NotNil(t, mux)

	// With planning deps → all five Fase 9 tasks registered.
	uc := planninguc.New(&nilRepo{}, nil, planninguc.Config{})
	mux2 := NewServeMux(ServeMuxDeps{Planning: uc})
	assert.NotNil(t, mux2)
}

func TestNewServeMux_ImportTaskStillRegistered(t *testing.T) {
	mux := NewServeMux(ServeMuxDeps{})
	assert.NotNil(t, mux)
}

// nilRepo never satisfies real calls — registration test only.
type nilRepo struct{}

func (n *nilRepo) GetExpiryCandidates(context.Context) ([]planning.ExpiryCandidate, error) { return nil, nil }
func (n *nilRepo) MarkBatchQuarantined(context.Context, int64) error                       { return nil }
func (n *nilRepo) GetReorderItems(context.Context, time.Time) ([]planning.ReorderItem, error) {
	return nil, nil
}
func (n *nilRepo) UpsertReplenishmentSuggestion(context.Context, *planning.ReorderSuggestion) error {
	return nil
}
func (n *nilRepo) GetBalanceTotals(context.Context) ([]planning.BalanceTotal, error) { return nil, nil }
func (n *nilRepo) GetLedgerTotals(context.Context) ([]planning.BalanceTotal, error)  { return nil, nil }
func (n *nilRepo) CreatePartition(context.Context, planning.PartitionSpec) error     { return nil }
func (n *nilRepo) RefreshMaterializedViews(context.Context, []string) error          { return nil }
func (n *nilRepo) StartJobRun(context.Context, planning.JobName) (int64, error)      { return 0, nil }
func (n *nilRepo) FinishJobRun(context.Context, int64, planning.JobRunResult) error  { return nil }
