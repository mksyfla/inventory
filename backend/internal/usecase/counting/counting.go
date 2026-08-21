package counting

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/authz"
	"inventory/internal/pkg/docnum"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5"
)

// countDocStore is the document repository slice the counting flow mutates.
type countDocStore interface {
	GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error)
	Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error
	UpdateStatus(ctx context.Context, id int64, status document.Status, approvedBy *int64) error
	TransitionStatus(ctx context.Context, id int64, expected, next document.Status, approvedBy *int64) (bool, error)
	GetByIDempotencyKey(ctx context.Context, key string) (*document.Document, error)
	NextSequence(ctx context.Context, docType, period string) (int64, error)
	CreateCountLines(ctx context.Context, lines []*document.CountLine) error
	ListCountLines(ctx context.Context, documentID int64) ([]*document.CountLine, error)
	UpdateCountLineCounted(ctx context.Context, id int64, qtyCounted float64, reasonCode *string, countedBy int64) error
	UpdateManagerApproval(ctx context.Context, id, managerID int64) error
}

// txRunner runs the whole count/adjustment mutation in one transaction.
type txRunner interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// DefaultValueThreshold is the variance value (in IDR) above which a count
// posting requires the second-level Inventory Manager approval (M6.4).
const DefaultValueThreshold = 5_000_000

// CountingUsecase implements the stock opname module (Fase 8.2-8.5):
//
//	CreateCount     — open a count session: CNT draft + blind qty_system snapshot
//	InputCountLines — field staff record qty_counted (variance computed)
//	PostCount       — approve & post adjustment movements; tiered approval
//	                  above the value threshold
//	CreateAdjustment— direct ADJ posting outside an opname (reason required)
type CountingUsecase struct {
	docs      countDocStore
	wh        WarehouseLookup
	items     ItemLookup
	balances  CountBalanceLookup
	values    ValueLookup
	posting   *stockuc.PostingUsecase
	txRunner  txRunner
	gen       *docnum.Generator
	threshold float64
	now       func() time.Time
}

// NewCountingUsecase wires the counting module. now defaults to time.Now and
// the value threshold to DefaultValueThreshold; override with WithClock and
// WithValueThreshold for deterministic tests.
func NewCountingUsecase(
	docs countDocStore,
	wh WarehouseLookup,
	items ItemLookup,
	balances CountBalanceLookup,
	values ValueLookup,
	posting *stockuc.PostingUsecase,
	txRunner txRunner,
	gen *docnum.Generator,
	opts ...Option,
) *CountingUsecase {
	u := &CountingUsecase{
		docs:      docs,
		wh:        wh,
		items:     items,
		balances:  balances,
		values:    values,
		posting:   posting,
		txRunner:  txRunner,
		gen:       gen,
		threshold: DefaultValueThreshold,
		now:       time.Now,
	}
	for _, opt := range opts {
		opt(u)
	}
	return u
}

// Option customizes a CountingUsecase (test hooks).
type Option func(*CountingUsecase)

// WithClock replaces the clock used for doc date and number period.
func WithClock(now func() time.Time) Option {
	return func(u *CountingUsecase) { u.now = now }
}

// WithValueThreshold overrides the tiered-approval variance value threshold.
func WithValueThreshold(amount float64) Option {
	return func(u *CountingUsecase) { u.threshold = amount }
}

// CreateCountInput is the payload of POST /counts (FR-6.1). The snapshot
// scope can be narrowed by zone and/or item list; when both are empty the
// whole warehouse's available stock is snapshotted.
type CreateCountInput struct {
	WarehouseID    int64
	Zone           string
	ItemIDs        []int64
	IdempotencyKey string
	Notes          string
	CreatedBy      int64
}

// CreateCount opens a count session: it creates the CNT document and takes an
// instant snapshot of the system quantities into doc.count_lines.qty_system
// (Blind Count — the values are hidden from field counters). Everything runs
// in one transaction so the snapshot can never diverge from the moment the
// session opened.
func (u *CountingUsecase) CreateCount(ctx context.Context, in CreateCountInput) (*document.Document, []*document.CountLine, error) {
	if in.IdempotencyKey != "" {
		existing, err := u.docs.GetByIDempotencyKey(ctx, in.IdempotencyKey)
		if err == nil {
			lines, err := u.docs.ListCountLines(ctx, existing.ID)
			if err != nil {
				return nil, nil, err
			}
			return existing, lines, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, err
		}
	}

	wh, err := u.wh.GetWarehouseByID(ctx, in.WarehouseID)
	if err != nil {
		return nil, nil, err
	}
	if !wh.IsActive {
		return nil, nil, validationErr("warehouse_id", "warehouse is inactive")
	}

	snapshots, err := u.balances.ListSnapshotBalances(ctx, wh.ID, in.Zone, 0)
	if err != nil {
		return nil, nil, err
	}
	want := make(map[int64]bool, len(in.ItemIDs))
	for _, id := range in.ItemIDs {
		want[id] = true
	}
	if len(want) > 0 {
		filtered := snapshots[:0]
		for _, s := range snapshots {
			if want[s.ItemID] {
				filtered = append(filtered, s)
			}
		}
		snapshots = filtered
	}

	now := u.now()
	var doc *document.Document
	var lines []*document.CountLine
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		docNo, err := u.gen.Next(txCtx, document.DocTypeCount.String(), wh.Code, now)
		if err != nil {
			return err
		}
		doc = &document.Document{
			DocNo:          docNo,
			DocType:        document.DocTypeCount,
			DocDate:        now,
			Status:         document.StatusDraft,
			WarehouseID:    wh.ID,
			IdempotencyKey: strPtr(in.IdempotencyKey),
			Notes:          strPtr(in.Notes),
			CreatedBy:      in.CreatedBy,
		}
		if err := u.docs.Create(txCtx, doc, nil); err != nil {
			return err
		}
		lines = make([]*document.CountLine, 0, len(snapshots))
		for _, s := range snapshots {
			lines = append(lines, &document.CountLine{
				DocumentID: doc.ID,
				ItemID:     s.ItemID,
				LocationID: s.LocationID,
				BatchID:    s.BatchID,
				QtySystem:  s.QtyOnhand,
			})
		}
		return u.docs.CreateCountLines(txCtx, lines)
	})
	if err != nil {
		return nil, nil, err
	}
	return doc, lines, nil
}

// InputCountLineInput is one field count of a snapshot line.
type InputCountLineInput struct {
	CountLineID int64
	QtyCounted  float64
	ReasonCode  string
}

// InputCountInput is the payload of POST /counts/{id}/lines (FR-6.2).
type InputCountInput struct {
	UserID int64
	Lines  []InputCountLineInput
}

// InputCountLines records the physical counts (FR-6.2). The session must
// still be open (draft). The database computes variance = qty_counted -
// qty_system; the returned lines expose it.
func (u *CountingUsecase) InputCountLines(ctx context.Context, id int64, in InputCountInput) ([]*document.CountLine, error) {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// C-02: the caller's warehouse must own the count session before recording lines.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return nil, err
	}
	if doc.DocType != document.DocTypeCount {
		return nil, apperr.New("ERR_NOT_FOUND", "count session not found")
	}
	if doc.Status != document.StatusDraft {
		return nil, apperr.New("ERR_INVALID_STATE", "count session is not open (already posted or cancelled)")
	}
	if len(in.Lines) == 0 {
		return nil, validationErr("lines", "at least one line is required")
	}

	existing, err := u.docs.ListCountLines(ctx, id)
	if err != nil {
		return nil, err
	}
	byID := make(map[int64]*document.CountLine, len(existing))
	for _, ln := range existing {
		byID[ln.ID] = ln
	}
	for i, rl := range in.Lines {
		if _, ok := byID[rl.CountLineID]; !ok {
			return nil, validationErr(fmt.Sprintf("lines[%d].count_line_id", i), "line is not part of this count session")
		}
		if rl.QtyCounted < 0 {
			return nil, validationErr(fmt.Sprintf("lines[%d].qty_counted", i), "must not be negative")
		}
	}

	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		for _, rl := range in.Lines {
			reason := strPtr(rl.ReasonCode)
			if err := u.docs.UpdateCountLineCounted(txCtx, rl.CountLineID, rl.QtyCounted, reason, in.UserID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return u.docs.ListCountLines(ctx, id)
}

// PostCountInput is the payload of POST /counts/{id}/post (M6.4 - M6.5).
// ManagerApproverID is required when the total variance value exceeds the
// threshold (tiered approval: Supervisor → Inventory Manager).
type PostCountInput struct {
	ApproverID        int64
	ManagerApproverID *int64
}

// PostCountResult summarizes the posted session.
type PostCountResult struct {
	Status                document.Status `json:"status"`
	TotalVariance         float64         `json:"total_variance"`
	TotalVarianceValue    float64         `json:"total_variance_value"`
	NeedsManagerApproval  bool            `json:"needs_manager_approval"`
	PostedAdjustmentLines int             `json:"posted_adjustment_lines"`
}

// PostCount approves and posts the count session (M6.4): every line must have
// been counted, the approver must differ from the maker (BR-05), and — when
// the valued variance exceeds the threshold — a second-level Inventory
// Manager approval is required (different from both maker and approver). The
// adjustment movements (type adjustment) are posted onto the ledger and the
// document is completed. Everything runs in one transaction.
func (u *CountingUsecase) PostCount(ctx context.Context, id int64, in PostCountInput) (*PostCountResult, error) {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// C-02: the caller's warehouse must own the count session before posting
	// its adjustment movements to stock.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return nil, err
	}
	if doc.DocType != document.DocTypeCount {
		return nil, apperr.New("ERR_NOT_FOUND", "count session not found")
	}
	if doc.Status != document.StatusDraft {
		return nil, apperr.New("ERR_INVALID_STATE", "count session is not open (already posted or cancelled)")
	}
	if err := document.ValidateApprover(doc.CreatedBy, in.ApproverID); err != nil {
		return nil, err
	}

	lines, err := u.docs.ListCountLines(ctx, id)
	if err != nil {
		return nil, err
	}
	if len(lines) == 0 {
		return nil, validationErr("lines", "count session has no snapshot lines")
	}
	for _, ln := range lines {
		if !ln.Counted() {
			return nil, validationErr("lines", fmt.Sprintf("count line %d has not been counted yet", ln.ID))
		}
	}

	// Nilai variance = Σ |qty_counted − qty_system| × unit_cost terakhir.
	totalVariance := 0.0
	totalValue := 0.0
	for _, ln := range lines {
		if ln.Variance == nil {
			continue
		}
		totalVariance += math.Abs(*ln.Variance)
		cost, err := u.values.LastUnitCost(ctx, ln.ItemID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		totalValue += math.Abs(*ln.Variance) * cost
	}
	needsManager := totalValue > u.threshold

	if needsManager {
		if in.ManagerApproverID == nil {
			return nil, validationErr("manager_approver_id",
				fmt.Sprintf("required: variance value %.2f exceeds the tiered-approval threshold %.2f", totalValue, u.threshold))
		}
		if err := validateManagerApproval(doc.CreatedBy, in.ApproverID, *in.ManagerApproverID); err != nil {
			return nil, err
		}
	} else if in.ManagerApproverID != nil {
		if err := validateManagerApproval(doc.CreatedBy, in.ApproverID, *in.ManagerApproverID); err != nil {
			return nil, err
		}
	}

	var movements []stock.StockMovementInput
	posted := 0
	for _, ln := range lines {
		if ln.Variance == nil || *ln.Variance == 0 {
			continue
		}
		movements = append(movements, stock.StockMovementInput{
			ItemID:       ln.ItemID,
			LocationID:   ln.LocationID,
			BatchID:      ln.BatchID,
			Status:       stock.StatusAvailable,
			MovementType: stock.TypeAdjustment,
			Qty:          *ln.Variance,
			DocLineID:    0, // opname bukan baris dokumen (nullable di ledger)
			CreatedBy:    in.ApproverID,
		})
		posted++
	}

	next, err := doc.Status.Transition(document.StatusSubmitted)
	if err != nil {
		return nil, err
	}
	if _, err = next.Transition(document.StatusApproved); err != nil {
		return nil, err
	}
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		// H-04: only one posting may approve+complete the session — a
		// concurrent post that already moved the doc wins; the loser rolls
		// back so its adjustment movements never hit the ledger.
		ok, err := u.docs.TransitionStatus(txCtx, id, doc.Status, document.StatusApproved, &in.ApproverID)
		if err != nil {
			return err
		}
		if !ok {
			return apperr.New("ERR_CONFLICT", "count session was already posted")
		}
		if needsManager {
			if err := u.docs.UpdateManagerApproval(txCtx, id, *in.ManagerApproverID); err != nil {
				return err
			}
		}
		if len(movements) > 0 {
			if err := u.posting.PostStockMovementInTx(txCtx, doc.DocNo, movements); err != nil {
				return err
			}
		}
		done, err := document.StatusApproved.Transition(document.StatusInProgress)
		if err != nil {
			return err
		}
		if _, err = done.Transition(document.StatusCompleted); err != nil {
			return err
		}
		return u.docs.UpdateStatus(txCtx, id, document.StatusCompleted, nil)
	})
	if err != nil {
		return nil, err
	}
	return &PostCountResult{
		Status:                document.StatusCompleted,
		TotalVariance:         totalVariance,
		TotalVarianceValue:    totalValue,
		NeedsManagerApproval:  needsManager,
		PostedAdjustmentLines: posted,
	}, nil
}

// validateManagerApproval enforces the tiered-approval chain (M6.4): the
// manager must be a different person from both the maker and the supervisor
// who approves.
func validateManagerApproval(createdBy, approverID, managerID int64) error {
	if managerID == createdBy {
		return validationErr("manager_approver_id", "must differ from the document creator")
	}
	if managerID == approverID {
		return validationErr("manager_approver_id", "must differ from the approver (tiered approval requires two distinct approvers)")
	}
	return nil
}
