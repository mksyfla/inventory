package transfer

import (
	"context"
	"errors"
	"fmt"
	"net/netip"
	"sort"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/docnum"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5"
)

// docStore is the document repository slice the transfer flow mutates.
type docStore interface {
	GetByID(ctx context.Context, id int64) (*document.Document, []*document.DocumentLine, error)
	Create(ctx context.Context, doc *document.Document, lines []*document.DocumentLine) error
	UpdateStatus(ctx context.Context, id int64, status document.Status, approvedBy *int64) error
	GetByIDempotencyKey(ctx context.Context, key string) (*document.Document, error)
	NextSequence(ctx context.Context, docType, period string) (int64, error)
	CreateTransferReceipt(ctx context.Context, rec *document.TransferReceipt) error
}

// txRunner runs the whole transfer mutation in one transaction.
type txRunner interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// AuditLogWriter records durable events (e.g. receive discrepancy) into
// aud.audit_logs — the escalation hook for the emergency notification
// pipeline (FR-5.1).
type AuditLogWriter interface {
	InsertAuditLog(ctx context.Context, userID int64, action, entity string, entityID int64, newValue []byte, ipAddress *netip.Addr) error
}

// TransferUsecase implements the inter-warehouse transfer module (Fase 8.1):
//
//	create  — TRF draft (source → dest warehouses, idempotent)
//	submit  — draft → submitted
//	approve — submitted → approved (maker-checker BR-05)
//	send    — approved → in_progress: issue source balances (FEFO/FIFO) and
//	          create the in_transit balance at the destination transit bin
//	receive — in_progress → completed: in_transit → available at target bins,
//	          receipts recorded, shortage logged as discrepancy
type TransferUsecase struct {
	docs     docStore
	items    ItemLookup
	wh       WarehouseLookup
	locs     LocationLookup
	cands    CandidateLookup
	posting  *stockuc.PostingUsecase
	txRunner txRunner
	gen      *docnum.Generator
	audit    AuditLogWriter
	now      func() time.Time
}

// NewTransferUsecase wires the transfer module. now defaults to time.Now;
// override with WithClock for deterministic tests.
func NewTransferUsecase(
	docs docStore,
	items ItemLookup,
	wh WarehouseLookup,
	locs LocationLookup,
	cands CandidateLookup,
	posting *stockuc.PostingUsecase,
	txRunner txRunner,
	gen *docnum.Generator,
	audit AuditLogWriter,
	opts ...Option,
) *TransferUsecase {
	u := &TransferUsecase{
		docs:     docs,
		items:    items,
		wh:       wh,
		locs:     locs,
		cands:    cands,
		posting:  posting,
		txRunner: txRunner,
		gen:      gen,
		audit:    audit,
		now:      time.Now,
	}
	for _, opt := range opts {
		opt(u)
	}
	return u
}

// Option customizes a TransferUsecase (test hooks).
type Option func(*TransferUsecase)

// WithClock replaces the clock used for doc date and number period.
func WithClock(now func() time.Time) Option {
	return func(u *TransferUsecase) { u.now = now }
}

// CreateLineInput is one item row of a new transfer.
type CreateLineInput struct {
	ItemID int64
	Qty    float64
	Uom    string // empty = item base uom
	Notes  string
}

// CreateTransferInput is the payload of POST /transfers (FR-5.1).
type CreateTransferInput struct {
	WarehouseID     int64 // gudang asal
	DestWarehouseID int64 // gudang tujuan
	IdempotencyKey  string
	Notes           string
	CreatedBy       int64
	Lines           []CreateLineInput
}

// CreateTransfer opens a TRF draft: validates both warehouses and the lines,
// allocates the TRF number and persists header + lines in one transaction.
// A repeated Idempotency-Key returns the existing document (FSD 4.5).
func (u *TransferUsecase) CreateTransfer(ctx context.Context, in CreateTransferInput) (*document.Document, []*document.DocumentLine, error) {
	if len(in.Lines) == 0 {
		return nil, nil, validationErr("lines", "at least one line is required")
	}
	if in.DestWarehouseID <= 0 {
		return nil, nil, validationErr("dest_warehouse_id", "required")
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

	src, err := u.wh.GetWarehouseByID(ctx, in.WarehouseID)
	if err != nil {
		return nil, nil, err
	}
	if !src.IsActive {
		return nil, nil, validationErr("warehouse_id", "warehouse is inactive")
	}
	dest, err := u.wh.GetWarehouseByID(ctx, in.DestWarehouseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, validationErr("dest_warehouse_id", "unknown destination warehouse")
		}
		return nil, nil, err
	}
	if !dest.IsActive {
		return nil, nil, validationErr("dest_warehouse_id", "destination warehouse is inactive")
	}
	if dest.ID == src.ID {
		return nil, nil, validationErr("dest_warehouse_id", "destination must differ from the source warehouse")
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
		docNo, err := u.gen.Next(txCtx, document.DocTypeTransfer.String(), src.Code, now)
		if err != nil {
			return err
		}
		doc = &document.Document{
			DocNo:           docNo,
			DocType:         document.DocTypeTransfer,
			DocDate:         now,
			Status:          document.StatusDraft,
			WarehouseID:     src.ID,
			DestWarehouseID: &dest.ID,
			IdempotencyKey:  strPtr(in.IdempotencyKey),
			Notes:           strPtr(in.Notes),
			CreatedBy:       in.CreatedBy,
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

// SubmitTransfer moves a draft transfer to submitted (FSD 4.4).
func (u *TransferUsecase) SubmitTransfer(ctx context.Context, id int64) error {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if doc.DocType != document.DocTypeTransfer {
		return apperr.New("ERR_NOT_FOUND", "transfer not found")
	}
	next, err := doc.Status.Transition(document.StatusSubmitted)
	if err != nil {
		return err
	}
	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		return u.docs.UpdateStatus(txCtx, id, next, nil)
	})
}

// ApproveTransfer approves a submitted transfer (maker-checker BR-05).
func (u *TransferUsecase) ApproveTransfer(ctx context.Context, id, approverID int64) error {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if doc.DocType != document.DocTypeTransfer {
		return apperr.New("ERR_NOT_FOUND", "transfer not found")
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

// SendTransfer ships the approved transfer (FR-5.1): it consumes the source
// warehouse balances FEFO/FIFO (negative transfer_out ledger rows) and books
// the same quantities onto the destination's transit bin with status
// in_transit. Everything runs in one transaction (FSD 4.1).
func (u *TransferUsecase) SendTransfer(ctx context.Context, id, userID int64) (document.Status, error) {
	doc, lines, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return "", err
	}
	if doc.DocType != document.DocTypeTransfer {
		return "", apperr.New("ERR_NOT_FOUND", "transfer not found")
	}
	if doc.DestWarehouseID == nil {
		return "", apperr.New("ERR_INVALID_STATE", "transfer has no destination warehouse")
	}
	if doc.Status != document.StatusApproved {
		return "", apperr.New("ERR_INVALID_STATE", "sending requires an approved transfer")
	}

	transit, err := u.locs.GetTransitLocation(ctx, *doc.DestWarehouseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", validationErr("dest_warehouse_id", "destination warehouse has no transit location configured")
		}
		return "", err
	}

	// Resolve per-line base quantity (qty in the line's UoM → base UoM).
	baseQty := make([]float64, len(lines))
	for i, ln := range lines {
		baseQty[i] = ln.QtyRequest * ln.ConvFactor
	}

	var movements []stock.StockMovementInput
	var shortages []ShortageDetail
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		for i, ln := range lines {
			candidates, err := u.cands.LockCandidates(txCtx, ln.ItemID, doc.WarehouseID)
			if err != nil {
				return err
			}
			need := baseQty[i]
			// Saldo in_transit tujuan diagregasi per batch agar batch
			// dipertahankan (receive memposting per batch fisik).
			transitByBatch := make(map[int64]*stock.StockMovementInput)
			for _, cand := range candidates {
				if need <= 0 {
					break
				}
				take := cand.QtyFree
				if take > need {
					take = need
				}
				if take <= 0 {
					continue
				}
				// Keluar dari gudang asal (negative, transfer_out).
				movements = append(movements, stock.StockMovementInput{
					ItemID:       cand.ItemID,
					LocationID:   cand.LocationID,
					BatchID:      cand.BatchID,
					Status:       stock.StatusAvailable,
					MovementType: stock.TypeTransferOut,
					Qty:          -take,
					DocLineID:    ln.ID,
					CreatedBy:    userID,
				})
				// Masuk ke lokasi transit gudang tujuan berstatus in_transit.
				key := int64(0)
				if cand.BatchID != nil {
					key = *cand.BatchID
				}
				agg, ok := transitByBatch[key]
				if !ok {
					agg = &stock.StockMovementInput{
						ItemID:       cand.ItemID,
						LocationID:   transit.ID,
						BatchID:      cand.BatchID,
						Status:       stock.StatusInTransit,
						MovementType: stock.TypeTransferIn,
						DocLineID:    ln.ID,
						CreatedBy:    userID,
					}
					transitByBatch[key] = agg
				}
				agg.Qty += take
				need -= take
			}
			if need > 0 {
				shortages = append(shortages, ShortageDetail{
					Field:     fmt.Sprintf("lines[%d].qty", i),
					SKU:       fmt.Sprintf("ITEM-%d", ln.ItemID),
					Requested: baseQty[i],
					Available: baseQty[i] - need,
				})
				continue
			}
			// Urutkan batch agar urutan ledger deterministik (FSD 4.1).
			keys := make([]int64, 0, len(transitByBatch))
			for k := range transitByBatch {
				keys = append(keys, k)
			}
			sort.Slice(keys, func(a, b int) bool { return keys[a] < keys[b] })
			for _, k := range keys {
				movements = append(movements, *transitByBatch[k])
			}
		}
		if len(shortages) > 0 {
			return &apperr.AppError{
				Code:    "ERR_STOCK_INSUFFICIENT",
				Message: "Saldo bebas tidak mencukupi",
				Details: shortages,
			}
		}
		if err := u.posting.PostStockMovementInTx(txCtx, doc.DocNo, movements); err != nil {
			return err
		}
		next, err := doc.Status.Transition(document.StatusInProgress)
		if err != nil {
			return err
		}
		return u.docs.UpdateStatus(txCtx, id, next, nil)
	})
	if err != nil {
		return "", err
	}
	return document.StatusInProgress, nil
}

// ReceiveLineInput is one line receipt at the destination warehouse.
type ReceiveLineInput struct {
	LineID      int64
	QtyReceived float64
	LocationID  int64  // bin tujuan (pick/bulk/staging) di gudang tujuan
	BatchID     *int64 // wajib untuk item batch-managed
	Notes       string
}

// ReceiveInput is the payload of POST /transfers/{id}/receive.
type ReceiveInput struct {
	UserID int64
	Lines  []ReceiveLineInput
}

// ReceiveResult is the outcome of a transfer receive: the new document status
// plus the recorded receipts and whether any shortage (discrepancy) occurred.
type ReceiveResult struct {
	Status         document.Status
	Receipts       []*document.TransferReceipt
	HasDiscrepancy bool
}

// ReceiveTransfer confirms receipt at the destination (FR-5.1): it moves the
// in_transit balance to the target bin (status available), records one
// doc.transfer_receipts row per line and — when the received quantity differs
// from what was sent — writes a durable discrepancy audit log (the emergency
// notification pipeline consumes it). Status becomes completed.
func (u *TransferUsecase) ReceiveTransfer(ctx context.Context, id int64, in ReceiveInput, ipAddress *netip.Addr) (*ReceiveResult, error) {
	doc, lines, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if doc.DocType != document.DocTypeTransfer {
		return nil, apperr.New("ERR_NOT_FOUND", "transfer not found")
	}
	if doc.Status != document.StatusInProgress {
		return nil, apperr.New("ERR_INVALID_STATE", "receiving requires a transfer that has been sent (in_progress)")
	}
	if doc.DestWarehouseID == nil {
		return nil, apperr.New("ERR_INVALID_STATE", "transfer has no destination warehouse")
	}
	if len(in.Lines) == 0 {
		return nil, validationErr("lines", "at least one line is required")
	}

	byID := make(map[int64]*document.DocumentLine, len(lines))
	for _, ln := range lines {
		byID[ln.ID] = ln
	}
	seen := make(map[int64]bool, len(in.Lines))
	resolvedLines := make([]resolved, 0, len(in.Lines))
	for i, rl := range in.Lines {
		ln, ok := byID[rl.LineID]
		if !ok {
			return nil, validationErr(fmt.Sprintf("lines[%d].line_id", i), "line is not part of this document")
		}
		if seen[rl.LineID] {
			return nil, validationErr(fmt.Sprintf("lines[%d].line_id", i), "line received more than once")
		}
		seen[rl.LineID] = true
		if rl.QtyReceived <= 0 {
			return nil, validationErr(fmt.Sprintf("lines[%d].qty_received", i), "must be greater than 0")
		}
		qtyBase := ln.QtyRequest * ln.ConvFactor
		if rl.QtyReceived > qtyBase {
			return nil, validationErr(fmt.Sprintf("lines[%d].qty_received", i), "cannot exceed the sent quantity")
		}
		loc, err := u.locs.GetLocationByID(ctx, rl.LocationID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, validationErr(fmt.Sprintf("lines[%d].location_id", i), "unknown location")
			}
			return nil, err
		}
		if loc.WarehouseID != *doc.DestWarehouseID {
			return nil, validationErr(fmt.Sprintf("lines[%d].location_id", i), "location must belong to the destination warehouse")
		}
		if !loc.IsActive {
			return nil, validationErr(fmt.Sprintf("lines[%d].location_id", i), "location is inactive")
		}
		if loc.LocType != "pick" && loc.LocType != "bulk" && loc.LocType != "staging" {
			return nil, validationErr(fmt.Sprintf("lines[%d].location_id", i), "location type must be pick, bulk or staging")
		}
		item, err := u.items.GetItemByID(ctx, ln.ItemID)
		if err != nil {
			return nil, err
		}
		if item.IsBatch && rl.BatchID == nil {
			return nil, validationErr(fmt.Sprintf("lines[%d].batch_id", i), "required for batch-managed items")
		}
		resolvedLines = append(resolvedLines, resolved{
			line:        ln,
			qtyBase:     qtyBase,
			qtyReceived: rl.QtyReceived,
			loc:         loc,
			batchID:     rl.BatchID,
			notes:       rl.Notes,
		})
	}
	if len(seen) != len(lines) {
		return nil, validationErr("lines", "every transfer line must be received in one request")
	}

	transit, err := u.locs.GetTransitLocation(ctx, *doc.DestWarehouseID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, validationErr("dest_warehouse_id", "destination warehouse has no transit location configured")
		}
		return nil, err
	}

	var movements []stock.StockMovementInput
	var receipts []*document.TransferReceipt
	hasDiscrepancy := false
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		for _, rl := range resolvedLines {
			// Keluar dari saldo in_transit lokasi transit gudang tujuan.
			movements = append(movements, stock.StockMovementInput{
				ItemID:       rl.line.ItemID,
				LocationID:   transit.ID,
				BatchID:      rl.batchID,
				Status:       stock.StatusInTransit,
				MovementType: stock.TypeTransferOut,
				Qty:          -rl.qtyReceived,
				DocLineID:    rl.line.ID,
				CreatedBy:    in.UserID,
			})
			// Masuk ke bin tujuan berstatus available.
			movements = append(movements, stock.StockMovementInput{
				ItemID:       rl.line.ItemID,
				LocationID:   rl.loc.ID,
				BatchID:      rl.batchID,
				Status:       stock.StatusAvailable,
				MovementType: stock.TypeTransferIn,
				Qty:          rl.qtyReceived,
				DocLineID:    rl.line.ID,
				CreatedBy:    in.UserID,
			})
			rec := &document.TransferReceipt{
				DocumentID:  id,
				LineID:      rl.line.ID,
				QtySent:     rl.qtyBase,
				QtyReceived: rl.qtyReceived,
				ReceivedBy:  in.UserID,
				Notes:       strPtr(rl.notes),
			}
			if err := u.docs.CreateTransferReceipt(txCtx, rec); err != nil {
				return err
			}
			receipts = append(receipts, rec)
			if rec.Variance < 0 {
				hasDiscrepancy = true
			}
		}
		if err := u.posting.PostStockMovementInTx(txCtx, doc.DocNo, movements); err != nil {
			return err
		}
		next, err := doc.Status.Transition(document.StatusCompleted)
		if err != nil {
			return err
		}
		if err := u.docs.UpdateStatus(txCtx, id, next, nil); err != nil {
			return err
		}
		// Selisih (barang kurang dari yang dikirim) → log audit severity
		// critical sebagai pemicu notifikasi darurat (FR-5.1).
		if hasDiscrepancy && u.audit != nil {
			payload, _ := jsonMarshal(receiptSummary(resolvedLines))
			return u.audit.InsertAuditLog(txCtx, in.UserID, "transfer.receive_discrepancy", "transfer", id, payload, ipAddress)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &ReceiveResult{
		Status:         document.StatusCompleted,
		Receipts:       receipts,
		HasDiscrepancy: hasDiscrepancy,
	}, nil
}
