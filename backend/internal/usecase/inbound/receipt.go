package inbound

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/docnum"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5"
)

// ReceiptUsecase implements the GRN (penerimaan barang) flow:
//
//	6.1 Create/Submit  — draft with lines, then submitted for approval
//	6.2 Approve        — maker-checker (BR-05), receipt posting to staging
//	6.3 SuggestPutaway — pick/bulk candidates scored per line
//	6.4 Putaway        — internal_move staging → target, doc → completed
//
// State transitions go through document.Status.Transition (FSD 4.4), posting
// follows the FSD 4.1 pattern (all-or-nothing, deterministic lock order).
type ReceiptUsecase struct {
	docs       document.DocumentRepository
	items      ItemLookup
	warehouses WarehouseLookup
	locs       LocationStore
	batches    BatchStore
	posting    *stockuc.PostingUsecase
	txRunner   stock.TxRunner
	gen        *docnum.Generator
	now        func() time.Time
}

// NewReceiptUsecase wires the inbound module. now defaults to time.Now;
// override with WithClock for deterministic tests.
func NewReceiptUsecase(
	docs document.DocumentRepository,
	items ItemLookup,
	warehouses WarehouseLookup,
	locs LocationStore,
	batches BatchStore,
	posting *stockuc.PostingUsecase,
	txRunner stock.TxRunner,
	gen *docnum.Generator,
	opts ...Option,
) *ReceiptUsecase {
	u := &ReceiptUsecase{
		docs:       docs,
		items:      items,
		warehouses: warehouses,
		locs:       locs,
		batches:    batches,
		posting:    posting,
		txRunner:   txRunner,
		gen:        gen,
		now:        time.Now,
	}
	for _, opt := range opts {
		opt(u)
	}
	return u
}

// Option customizes a ReceiptUsecase (test hooks).
type Option func(*ReceiptUsecase)

// WithClock replaces the clock used for doc date and number period.
func WithClock(now func() time.Time) Option {
	return func(u *ReceiptUsecase) { u.now = now }
}

// CreateLineInput is one item row of a new GRN.
type CreateLineInput struct {
	ItemID     int64
	Qty        float64
	Uom        string // empty = item base uom
	BatchNo    string // required for is_batch items
	ExpiryDate *time.Time
	Status     string // receiving QC outcome: available|quarantine|damaged
	Notes      string
}

// CreateInput is the full payload of a new GRN draft.
type CreateInput struct {
	WarehouseID    int64
	PartnerID      *int64
	IdempotencyKey string
	Notes          string
	CreatedBy      int64
	Lines          []CreateLineInput
}

// Create opens a GRN draft: validates master data, resolves/creates batches,
// allocates the doc number and persists header + lines in one transaction
// (FSD 4.3). A repeated Idempotency-Key returns the existing document (FSD 4.5).
func (u *ReceiptUsecase) Create(ctx context.Context, in CreateInput) (*document.Document, []*document.DocumentLine, error) {
	if len(in.Lines) == 0 {
		return nil, nil, validationErr("lines", "at least one line is required")
	}

	// Idempotent replay: same key → same document (FSD 4.5).
	if in.IdempotencyKey != "" {
		existing, err := u.docs.GetByIDempotencyKey(ctx, in.IdempotencyKey)
		if err == nil {
			return existing, nil, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, err
		}
	}

	wh, err := u.warehouses.GetWarehouseByID(ctx, in.WarehouseID)
	if err != nil {
		return nil, nil, err
	}
	if !wh.IsActive {
		return nil, nil, validationErr("warehouse_id", "warehouse is inactive")
	}

	// Validate every line up front so we fail before opening the transaction.
	type prep struct {
		in      CreateLineInput
		item    *ItemInfo
		uom     string
		conv    float64
		status  string
		batchID *int64
	}
	preps := make([]prep, 0, len(in.Lines))
	for i, ln := range in.Lines {
		item, err := u.items.GetItemByID(ctx, ln.ItemID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil, validationErr(fmt.Sprintf("lines[%d].item_id", i), "unknown item")
			}
			return nil, nil, err
		}
		if !item.IsActive {
			return nil, nil, validationErr(fmt.Sprintf("lines[%d].item_id", i), "item is inactive")
		}
		if ln.Qty <= 0 {
			return nil, nil, validationErr(fmt.Sprintf("lines[%d].qty", i), "must be greater than 0")
		}
		uom := ln.Uom
		if uom == "" {
			uom = item.BaseUom
		}
		conv, err := u.items.UomConvFactor(ctx, ln.ItemID, uom)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil, validationErr(fmt.Sprintf("lines[%d].uom", i), fmt.Sprintf("unknown uom %q for item", uom))
			}
			return nil, nil, err
		}
		if item.IsBatch && ln.BatchNo == "" {
			return nil, nil, validationErr(fmt.Sprintf("lines[%d].batch_no", i), "required for batch-managed item")
		}
		if !item.IsBatch && ln.BatchNo != "" {
			return nil, nil, validationErr(fmt.Sprintf("lines[%d].batch_no", i), "not allowed for non-batch item")
		}
		if item.IsExpiry && ln.ExpiryDate == nil {
			return nil, nil, validationErr(fmt.Sprintf("lines[%d].expiry_date", i), "required for expiry-managed item")
		}
		status := ln.Status
		if status == "" {
			status = string(stock.StatusAvailable)
		}
		if !validReceiptStatus(status) {
			return nil, nil, validationErr(fmt.Sprintf("lines[%d].status", i), "must be one of [available quarantine damaged]")
		}
		preps = append(preps, prep{in: ln, item: item, uom: uom, conv: conv, status: status})
	}

	now := u.now()
	var doc *document.Document
	var lines []*document.DocumentLine
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		// Resolve or create batches inside the tx so a new batch commits
		// atomically with the document and its lines.
		for i := range preps {
			if preps[i].in.BatchNo == "" {
				continue
			}
			b, err := u.batches.GetByItemAndNo(txCtx, preps[i].item.ID, preps[i].in.BatchNo)
			if err != nil {
				if !errors.Is(err, pgx.ErrNoRows) {
					return err
				}
				b, err = u.batches.Create(txCtx, preps[i].item.ID, preps[i].in.BatchNo, preps[i].in.ExpiryDate)
				if err != nil {
					return fmt.Errorf("failed to create batch: %w", err)
				}
			}
			preps[i].batchID = &b.ID
		}

		docNo, err := u.gen.Next(txCtx, document.DocTypeGRN.String(), wh.Code, now)
		if err != nil {
			return err
		}

		doc = &document.Document{
			DocNo:          docNo,
			DocType:        document.DocTypeGRN,
			DocDate:        now,
			Status:         document.StatusDraft,
			WarehouseID:    wh.ID,
			PartnerID:      in.PartnerID,
			IdempotencyKey: strPtr(in.IdempotencyKey),
			Notes:          strPtr(in.Notes),
			CreatedBy:      in.CreatedBy,
		}
		lines = make([]*document.DocumentLine, 0, len(preps))
		for i, p := range preps {
			lines = append(lines, &document.DocumentLine{
				LineNo:     i + 1,
				ItemID:     p.item.ID,
				Uom:        p.uom,
				ConvFactor: p.conv,
				QtyRequest: p.in.Qty,
				BatchID:    p.batchID,
				Status:     p.status,
				Notes:      strPtr(p.in.Notes),
			})
		}
		return u.docs.Create(txCtx, doc, lines)
	})
	if err != nil {
		return nil, nil, err
	}
	return doc, lines, nil
}

// Submit moves a draft GRN to submitted for approval (FSD 4.4).
func (u *ReceiptUsecase) Submit(ctx context.Context, id int64) error {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	next, err := doc.Status.Transition(document.StatusSubmitted)
	if err != nil {
		return err
	}
	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		return u.docs.UpdateStatus(txCtx, id, next, nil)
	})
}

// Approve posts the GRN to the staging location and marks it approved
// (maker-checker BR-05; FSD 4.1 all-or-nothing).
func (u *ReceiptUsecase) Approve(ctx context.Context, id, approverID int64) error {
	doc, lines, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if err := document.ValidateApprover(doc.CreatedBy, approverID); err != nil {
		return err
	}
	next, err := doc.Status.Transition(document.StatusApproved)
	if err != nil {
		return err
	}

	staging, err := u.locs.GetStaging(ctx, doc.WarehouseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.New("ERR_NOT_FOUND", "staging location is not configured for this warehouse")
		}
		return err
	}

	// One receipt movement per line, qty converted to base uom (FSD 4.1).
	inputs := make([]stock.StockMovementInput, 0, len(lines))
	for _, ln := range lines {
		inputs = append(inputs, stock.StockMovementInput{
			ItemID:       ln.ItemID,
			LocationID:   staging.ID,
			BatchID:      ln.BatchID,
			Status:       stock.StockStatus(ln.Status),
			MovementType: stock.TypeReceipt,
			Qty:          ln.QtyRequest * ln.ConvFactor,
			DocLineID:    ln.ID,
			CreatedBy:    approverID,
		})
	}

	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		if err := u.posting.PostStockMovementInTx(txCtx, doc.DocNo, inputs); err != nil {
			return err
		}
		return u.docs.UpdateStatus(txCtx, id, next, &approverID)
	})
}

// SuggestedLocation is one scored putaway target.
type SuggestedLocation struct {
	LocationID int64   `json:"location_id"`
	Code       string  `json:"code"`
	Zone       string  `json:"zone,omitempty"`
	Rack       string  `json:"rack,omitempty"`
	Level      string  `json:"level,omitempty"`
	LocType    string  `json:"loc_type"`
	FreeQty    float64 `json:"free_qty"`
}

// PutawaySuggestion is the per-line suggestion list (FR-2.5).
type PutawaySuggestion struct {
	LineID       int64               `json:"line_id"`
	ItemID       int64               `json:"item_id"`
	QtyRemaining float64             `json:"qty_remaining"`
	Locations    []SuggestedLocation `json:"locations"`
}

// SuggestPutaway scores the warehouse's pick/bulk locations for every line
// still waiting for putaway (FR-2.5, FSD 4.2): class-A items prefer the pick
// face, otherwise pick_seq is the tie-breaker, and locations that cannot
// physically fit the quantity are excluded.
func (u *ReceiptUsecase) SuggestPutaway(ctx context.Context, id int64) ([]PutawaySuggestion, error) {
	doc, lines, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if doc.Status != document.StatusApproved && doc.Status != document.StatusInProgress {
		return nil, apperr.New("ERR_INVALID_STATE",
			"putaway requires an approved or in-progress document")
	}

	candidates, err := u.locs.PutawayCandidates(ctx, doc.WarehouseID)
	if err != nil {
		return nil, err
	}

	suggestions := make([]PutawaySuggestion, 0, len(lines))
	for _, ln := range lines {
		remaining := ln.Remaining()
		if remaining <= 0 {
			continue
		}
		abc := ""
		if item, ierr := u.items.GetItemByID(ctx, ln.ItemID); ierr == nil {
			abc = item.ABCClass
		}
		best := pickBestPutaway(candidates, abc, remaining, 3)
		locs := make([]SuggestedLocation, 0, len(best))
		for _, c := range best {
			locs = append(locs, SuggestedLocation{
				LocationID: c.Location.ID,
				Code:       c.Location.Code,
				Zone:       c.Location.Zone,
				Rack:       c.Location.Rack,
				Level:      c.Location.Level,
				LocType:    c.Location.LocType,
				FreeQty:    freeQty(c),
			})
		}
		suggestions = append(suggestions, PutawaySuggestion{
			LineID:       ln.ID,
			ItemID:       ln.ItemID,
			QtyRemaining: remaining,
			Locations:    locs,
		})
	}
	return suggestions, nil
}

// pickBestPutaway returns the top `limit` candidates that can physically hold
// qty, ordered by fit (FR-2.5): class-A items rank pick locations above bulk;
// pick_seq breaks ties; then code. Pure function, unit-tested directly.
func pickBestPutaway(cands []*PutawayCandidate, abcClass string, qty float64, limit int) []*PutawayCandidate {
	feasible := make([]*PutawayCandidate, 0, len(cands))
	for _, c := range cands {
		if c.Location.Capacity != nil && c.UsedQty+qty > *c.Location.Capacity {
			continue // cannot fit
		}
		feasible = append(feasible, c)
	}
	sort.SliceStable(feasible, func(i, j int) bool {
		ri, rj := rankABC(feasible[i], abcClass), rankABC(feasible[j], abcClass)
		if ri != rj {
			return ri < rj
		}
		// pick_seq nil sorts last (matches the candidates SQL: NULLS LAST).
		pi, pj := int(^uint(0)>>1), int(^uint(0)>>1)
		if feasible[i].Location.PickSeq != nil {
			pi = *feasible[i].Location.PickSeq
		}
		if feasible[j].Location.PickSeq != nil {
			pj = *feasible[j].Location.PickSeq
		}
		if pi != pj {
			return pi < pj
		}
		return feasible[i].Location.Code < feasible[j].Location.Code
	})
	if len(feasible) > limit {
		feasible = feasible[:limit]
	}
	return feasible
}

// rankABC encodes the putaway preference: class-A (fast movers) prefer the
// pick face; everything else treats pick and bulk equally.
func rankABC(c *PutawayCandidate, abcClass string) int {
	if abcClass == "A" && c.Location.LocType == "bulk" {
		return 1
	}
	return 0
}

func freeQty(c *PutawayCandidate) float64 {
	if c.Location.Capacity == nil {
		return 0 // unlimited storage: no explicit free quantity
	}
	f := *c.Location.Capacity - c.UsedQty
	if f < 0 {
		return 0
	}
	return f
}

// PutawayScan is one scanned putaway action (FR-2.5).
type PutawayScan struct {
	LineID       int64
	Qty          float64
	LocationCode string
}

// Putaway moves quantity line by line from staging to the scanned target:
// two internal_move ledgers per scan (staging −qty, target +qty), then the
// line's qty_processed grows and the document advances approved →
// in_progress → completed once every line is fully stored (FSD 4.4).
// It returns the document's status after the scans.
func (u *ReceiptUsecase) Putaway(ctx context.Context, id, userID int64, scans []PutawayScan) (document.Status, error) {
	if len(scans) == 0 {
		return "", validationErr("lines", "at least one putaway scan is required")
	}

	doc, lines, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return "", err
	}
	if doc.Status != document.StatusApproved && doc.Status != document.StatusInProgress {
		return "", apperr.New("ERR_INVALID_STATE",
			"putaway requires an approved or in-progress document")
	}

	byID := make(map[int64]*document.DocumentLine, len(lines))
	for _, ln := range lines {
		byID[ln.ID] = ln
	}
	staging, err := u.locs.GetStaging(ctx, doc.WarehouseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", apperr.New("ERR_NOT_FOUND", "staging location is not configured for this warehouse")
		}
		return "", err
	}

	// Validate every scan before touching the ledger (all-or-nothing).
	type resolved struct {
		line   *document.DocumentLine
		target *LocationInfo
		qty    float64
	}
	items := make([]resolved, 0, len(scans))
	for _, sc := range scans {
		ln, ok := byID[sc.LineID]
		if !ok {
			return "", validationErr("lines", fmt.Sprintf("line %d is not part of this document", sc.LineID))
		}
		if sc.Qty <= 0 {
			return "", validationErr("lines", "putaway qty must be greater than 0")
		}
		if sc.Qty > ln.Remaining() {
			return "", validationErr("lines", fmt.Sprintf("line %d: qty exceeds remaining %v", sc.LineID, ln.Remaining()))
		}
		target, err := u.locs.GetByWarehouseCode(ctx, doc.WarehouseID, sc.LocationCode)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return "", validationErr("lines", fmt.Sprintf("location %q not found", sc.LocationCode))
			}
			return "", err
		}
		items = append(items, resolved{line: ln, target: target, qty: sc.Qty})
	}

	// Two ledgers per scan: staging out, target in (same doc, same line).
	inputs := make([]stock.StockMovementInput, 0, len(items)*2)
	for _, it := range items {
		qtyBase := it.qty * it.line.ConvFactor
		inputs = append(inputs,
			stock.StockMovementInput{
				ItemID:       it.line.ItemID,
				LocationID:   staging.ID,
				BatchID:      it.line.BatchID,
				Status:       stock.StockStatus(it.line.Status),
				MovementType: stock.TypeInternalMove,
				Qty:          -qtyBase,
				DocLineID:    it.line.ID,
				CreatedBy:    userID,
			},
			stock.StockMovementInput{
				ItemID:       it.line.ItemID,
				LocationID:   it.target.ID,
				BatchID:      it.line.BatchID,
				Status:       stock.StockStatus(it.line.Status),
				MovementType: stock.TypeInternalMove,
				Qty:          qtyBase,
				DocLineID:    it.line.ID,
				CreatedBy:    userID,
			})
	}

	var next document.Status
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		if err := u.posting.PostStockMovementInTx(txCtx, doc.DocNo, inputs); err != nil {
			return err
		}

		// Persist processed quantities, then derive the document's next state.
		nextProc := make(map[int64]float64, len(items))
		for _, it := range items {
			proc := it.line.QtyProcessed + it.qty
			nextProc[it.line.ID] = proc
			if err := u.docs.UpdateLinePutaway(txCtx, it.line.ID, proc, it.target.ID); err != nil {
				return err
			}
		}
		allDone := true
		for _, ln := range lines {
			proc := ln.QtyProcessed
			if p, ok := nextProc[ln.ID]; ok {
				proc = p
			}
			if proc < ln.QtyRequest {
				allDone = false
				break
			}
		}

		next = doc.Status
		if allDone && next != document.StatusCompleted {
			// Walk approved → in_progress → completed, or straight
			// in_progress → completed when an earlier scan already started.
			var mid document.Status
			if next == document.StatusApproved {
				m, err := next.Transition(document.StatusInProgress)
				if err != nil {
					return err
				}
				mid = m
			} else {
				mid = next
			}
			final, err := mid.Transition(document.StatusCompleted)
			if err != nil {
				return err
			}
			next = final
		} else if next == document.StatusApproved {
			n, err := next.Transition(document.StatusInProgress)
			if err != nil {
				return err
			}
			next = n
		}
		if next == doc.Status {
			return nil
		}
		return u.docs.UpdateStatus(txCtx, id, next, nil)
	})
	return next, err
}

func validReceiptStatus(s string) bool {
	switch stock.StockStatus(s) {
	case stock.StatusAvailable, stock.StatusQuarantine, stock.StatusDamaged:
		return true
	}
	return false
}

func validationErr(field, msg string) error {
	return &apperr.AppError{
		Code:    "ERR_VALIDATION",
		Message: "Invalid request payload",
		Details: []apperr.ErrorDetail{{Field: field, Message: msg}},
	}
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
