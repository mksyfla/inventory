package outbound

import (
	"context"
	"errors"
	"fmt"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/authz"

	"github.com/jackc/pgx/v5"
)

// PickingListItem is one row of the picking list (FR-4.3). The list is ordered
// by the location's pick_seq so pickers walk the shortest route.
type PickingListItem struct {
	AllocationID int64      `json:"allocation_id"`
	LineID       int64      `json:"line_id"`
	ItemID       int64      `json:"item_id"`
	SKU          string     `json:"sku"`
	BaseUom      string     `json:"base_uom"`
	LocationID   int64      `json:"location_id"`
	LocationCode string     `json:"location_code"`
	PickSeq      *int       `json:"pick_seq,omitempty"`
	BatchID      *int64     `json:"batch_id,omitempty"`
	BatchNo      string     `json:"batch_no,omitempty"`
	ExpiryDate   *time.Time `json:"expiry_date,omitempty"`
	QtyAllocated float64    `json:"qty_allocated"`
	QtyPicked    float64    `json:"qty_picked"`
	QtyRemaining float64    `json:"qty_remaining"`
}

// PickingList returns the allocations of an allocated DO ordered by pick_seq
// (FR-4.3). Requires the document to be approved (allocated, not yet shipped)
// or in progress.
func (u *OutboundUsecase) PickingList(ctx context.Context, id int64) ([]PickingListItem, error) {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// C-02: picking data is warehouse-scoped — never reveal another warehouse's
	// allocations (C-04).
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return nil, err
	}
	if doc.DocType != document.DocTypeDO {
		return nil, apperr.New("ERR_NOT_FOUND", "delivery order not found")
	}
	if doc.Status != document.StatusApproved && doc.Status != document.StatusInProgress {
		return nil, apperr.New("ERR_INVALID_STATE", "picking list requires an approved or in-progress delivery order")
	}

	allocs, err := u.docs.ListAllocations(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]PickingListItem, 0, len(allocs))
	for _, a := range allocs {
		out = append(out, PickingListItem{
			AllocationID: a.ID,
			LineID:       a.DocLineID,
			ItemID:       a.ItemID,
			SKU:          a.SKU,
			BaseUom:      a.BaseUom,
			LocationID:   a.LocationID,
			LocationCode: a.LocationCode,
			PickSeq:      a.PickSeq,
			BatchID:      a.BatchID,
			BatchNo:      a.BatchNo,
			ExpiryDate:   a.ExpiryDate,
			QtyAllocated: a.QtyAllocated,
			QtyPicked:    a.QtyPicked,
			QtyRemaining: a.Remaining(),
		})
	}
	return out, nil
}

// PickScanInput is one scanned picking action (FR-4.4).
type PickScanInput struct {
	AllocationID    int64
	LocationBarcode string
	ItemBarcode     string
	Qty             float64
}

// PickInput is the payload of POST /deliveries/{id}/pick.
type PickInput struct {
	Scans []PickScanInput
}

// Pick verifies every scanned allocation against its item and location
// barcodes and marks the picked quantity. Any mismatch aborts the whole pick
// with ERR_SCAN_MISMATCH (FR-4.4) — the line is never processed until the
// discrepancy is resolved.
func (u *OutboundUsecase) Pick(ctx context.Context, id int64, in PickInput) error {
	if len(in.Scans) == 0 {
		return validationErr("scans", "at least one scan is required")
	}
	doc, lines, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	// C-02: the caller's warehouse must own the document before confirming picks.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return err
	}
	if doc.DocType != document.DocTypeDO {
		return apperr.New("ERR_NOT_FOUND", "delivery order not found")
	}
	if doc.Status != document.StatusApproved && doc.Status != document.StatusInProgress {
		return apperr.New("ERR_INVALID_STATE", "picking requires an approved or in-progress delivery order")
	}

	allocs, err := u.docs.ListAllocations(ctx, id)
	if err != nil {
		return err
	}
	allocByID := make(map[int64]*document.Allocation, len(allocs))
	for _, a := range allocs {
		allocByID[a.ID] = a
	}

	lineByID := make(map[int64]*document.DocumentLine, len(lines))
	for _, ln := range lines {
		lineByID[ln.ID] = ln
	}

	// Validate every scan against the allocations before touching the ledger.
	type validated struct {
		alloc *document.Allocation
		qty   float64
	}
	scans := make([]validated, 0, len(in.Scans))
	for i, sc := range in.Scans {
		alloc, ok := allocByID[sc.AllocationID]
		if !ok {
			return scanMismatch(fmt.Sprintf("scans[%d].allocation_id", i), "allocation is not part of this document")
		}
		if sc.Qty <= 0 {
			return validationErr(fmt.Sprintf("scans[%d].qty", i), "must be greater than 0")
		}
		if sc.Qty > alloc.Remaining() {
			return validationErr(fmt.Sprintf("scans[%d].qty", i), fmt.Sprintf("exceeds remaining %v of the allocation", alloc.Remaining()))
		}
		barcode, err := u.items.GetItemByBarcode(ctx, sc.ItemBarcode)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return scanMismatch(fmt.Sprintf("scans[%d].item_barcode", i), "unknown item barcode")
			}
			return err
		}
		if barcode.ItemID != alloc.ItemID {
			return scanMismatch(fmt.Sprintf("scans[%d].item_barcode", i), fmt.Sprintf("barcode %q does not match the allocated item", sc.ItemBarcode))
		}
		loc, err := u.locs.GetByWarehouseCode(ctx, doc.WarehouseID, sc.LocationBarcode)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return scanMismatch(fmt.Sprintf("scans[%d].location_barcode", i), "unknown location barcode")
			}
			return err
		}
		if loc.ID != alloc.LocationID {
			return scanMismatch(fmt.Sprintf("scans[%d].location_barcode", i), fmt.Sprintf("location %q does not match the allocation bin", sc.LocationBarcode))
		}
		scans = append(scans, validated{alloc: alloc, qty: sc.Qty})
	}

	// Per-line picked quantity in line UOM (allocation qty is base UOM).
	linePickedBase := make(map[int64]float64, len(scans))
	for _, s := range scans {
		linePickedBase[s.alloc.DocLineID] += s.qty
	}

	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		for _, s := range scans {
			if err := u.docs.UpdateAllocationPicked(txCtx, s.alloc.ID, s.qty); err != nil {
				return err
			}
		}
		for lineID, pickedBase := range linePickedBase {
			ln := lineByID[lineID]
			processed := ln.QtyProcessed + pickedBase/ln.ConvFactor
			if err := u.docs.UpdateLineProcessed(txCtx, lineID, processed); err != nil {
				return err
			}
		}
		return nil
	})
}

func scanMismatch(field, msg string) error {
	return &apperr.AppError{
		Code:    "ERR_SCAN_MISMATCH",
		Message: "Scanned barcode does not match the allocation",
		Details: []apperr.ErrorDetail{{Field: field, Message: msg}},
	}
}
