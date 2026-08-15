package outbound

import (
	"context"
	"errors"
	"fmt"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/docnum"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5"
)

// OutboundUsecase implements the outbound module (Fase 7):
//
//	7.1 Request & Delivery Order  — REQ draft/submit/approve; DO from an approved REQ
//	7.2 Allocate                 — FEFO/FIFO engine (FSD §4.2) with reservations
//	7.3 Override allocation      — manual balance pick requiring reason_code
//	7.4 Picking list             — allocations ordered by pick_seq
//	7.5 Pick scan verification   — barcode vs allocation, ERR_SCAN_MISMATCH
//	7.6 Ship posting             — issue ledger, release reservation, in_progress
//	7.7 POD                      — receiver/arrival/file, doc → completed
//
// State transitions go through document.Status.Transition (FSD 4.4); stock
// posting follows the FSD 4.1 pattern (all-or-nothing, deterministic lock order).
type OutboundUsecase struct {
	docs     document.DocumentRepository
	items    ItemLookup
	wh       WarehouseLookup
	locs     LocationLookup
	cands    StockCandidates
	stock    stockRepo
	txRunner txRunner
	posting  *stockuc.PostingUsecase
	gen      *docnum.Generator
	now      func() time.Time
}

// stockRepo is the slice of the stock repository the outbound flow mutates:
// the reservation release during shipping. Balance locking and the ledger
// write are delegated to the posting engine inside the same transaction.
type stockRepo interface {
	UpdateBalanceReserved(ctx context.Context, id int64, delta float64) error
}

// txRunner runs the whole outbound mutation in a single transaction.
type txRunner interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// NewOutboundUsecase wires the outbound module. now defaults to time.Now;
// override with WithClock for deterministic tests.
func NewOutboundUsecase(
	docs document.DocumentRepository,
	items ItemLookup,
	wh WarehouseLookup,
	locs LocationLookup,
	cands StockCandidates,
	stock stockRepo,
	txRunner txRunner,
	posting *stockuc.PostingUsecase,
	gen *docnum.Generator,
	opts ...Option,
) *OutboundUsecase {
	u := &OutboundUsecase{
		docs:     docs,
		items:    items,
		wh:       wh,
		locs:     locs,
		cands:    cands,
		stock:    stock,
		txRunner: txRunner,
		posting:  posting,
		gen:      gen,
		now:      time.Now,
	}
	for _, opt := range opts {
		opt(u)
	}
	return u
}

// Option customizes an OutboundUsecase (test hooks).
type Option func(*OutboundUsecase)

// WithClock replaces the clock used for doc date and number period.
func WithClock(now func() time.Time) Option {
	return func(u *OutboundUsecase) { u.now = now }
}

// CreateLineInput is one item row of a new request (REQ).
type CreateLineInput struct {
	ItemID int64
	Qty    float64
	Uom    string // empty = item base uom
	Notes  string
}

// CreateRequestInput is the full payload of a new request draft.
type CreateRequestInput struct {
	WarehouseID    int64
	PartnerID      *int64
	IdempotencyKey string
	Notes          string
	CreatedBy      int64
	Lines          []CreateLineInput
}

// CreateRequest opens a request draft: validates master data, allocates the
// REQ number and persists header + lines in one transaction (Fase 7.1,
// FSD 4.3). A repeated Idempotency-Key returns the existing document (FSD 4.5).
func (u *OutboundUsecase) CreateRequest(ctx context.Context, in CreateRequestInput) (*document.Document, []*document.DocumentLine, error) {
	if len(in.Lines) == 0 {
		return nil, nil, validationErr("lines", "at least one line is required")
	}

	if in.IdempotencyKey != "" {
		existing, err := u.docs.GetByIDempotencyKey(ctx, in.IdempotencyKey)
		if err == nil {
			return existing, nil, nil
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

	type prep struct {
		in   CreateLineInput
		item *ItemInfo
		uom  string
		conv float64
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
		preps = append(preps, prep{in: ln, item: item, uom: uom, conv: conv})
	}

	now := u.now()
	var doc *document.Document
	var lines []*document.DocumentLine
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		docNo, err := u.gen.Next(txCtx, document.DocTypeRequest.String(), wh.Code, now)
		if err != nil {
			return err
		}
		doc = &document.Document{
			DocNo:          docNo,
			DocType:        document.DocTypeRequest,
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
				Status:     "available",
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

// SubmitRequest moves a draft request to submitted (FSD 4.4).
func (u *OutboundUsecase) SubmitRequest(ctx context.Context, id int64) error {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if doc.DocType != document.DocTypeRequest {
		return apperr.New("ERR_NOT_FOUND", "request not found")
	}
	next, err := doc.Status.Transition(document.StatusSubmitted)
	if err != nil {
		return err
	}
	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		return u.docs.UpdateStatus(txCtx, id, next, nil)
	})
}

// ApproveRequest approves a submitted request (maker-checker BR-05).
func (u *OutboundUsecase) ApproveRequest(ctx context.Context, id, approverID int64) error {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if doc.DocType != document.DocTypeRequest {
		return apperr.New("ERR_NOT_FOUND", "request not found")
	}
	if err := document.ValidateApprover(doc.CreatedBy, approverID); err != nil {
		return err
	}
	next, err := doc.Status.Transition(document.StatusApproved)
	if err != nil {
		return err
	}
	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		return u.docs.UpdateStatus(txCtx, id, next, &approverID)
	})
}
