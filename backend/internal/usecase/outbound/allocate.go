package outbound

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/authz"

	"github.com/jackc/pgx/v5"
)

// LineAllocInput requests allocation of `qty` (in the line's UOM) of a
// document line.
type LineAllocInput struct {
	LineID int64
	Qty    float64
}

// AllocateInput is the payload of POST /deliveries/{id}/allocate (FR-4.2).
type AllocateInput struct {
	Lines []LineAllocInput
}

// OverrideLineInput is one manual allocation: pick a specific balance.
type OverrideLineInput struct {
	LineID    int64
	Qty       float64
	BalanceID int64
}

// OverrideInput is the payload of POST /deliveries/{id}/allocate/override
// (FR-4.2 override, Fase 7.3). reason_code is mandatory.
type OverrideInput struct {
	ReasonCode string
	Lines      []OverrideLineInput
}

// AllocationResult is one freshly created doc.allocations row (Fase 7.2/7.3).
type AllocationResult struct {
	LineID       int64      `json:"line_id"`
	AllocationID int64      `json:"allocation_id"`
	BalanceID    int64      `json:"balance_id"`
	LocationCode string     `json:"location_code"`
	BatchID      *int64     `json:"batch_id,omitempty"`
	ExpiryDate   *time.Time `json:"expiry_date,omitempty"`
	PickSeq      *int       `json:"pick_seq,omitempty"`
	QtyAllocated float64    `json:"qty_allocated"`
}

// Allocate runs the FEFO/FIFO allocation engine (FSD §4.2): for every line it
// locks the candidate balances ordered by (expiry_date NULLS LAST, id,
// pick_seq), allocates from the cheapest candidates first and bumps
// qty_reserved. If the free balance is insufficient the whole transaction is
// aborted with ERR_STOCK_INSUFFICIENT and per-line shortage details.
func (u *OutboundUsecase) Allocate(ctx context.Context, id int64, in AllocateInput) ([]AllocationResult, error) {
	if len(in.Lines) == 0 {
		return nil, validationErr("lines", "at least one line is required")
	}
	doc, lines, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// C-02: the caller's warehouse must own the document before reserving stock.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return nil, err
	}
	if doc.DocType != document.DocTypeDO {
		return nil, apperr.New("ERR_NOT_FOUND", "delivery order not found")
	}
	if doc.Status != document.StatusApproved {
		return nil, apperr.New("ERR_INVALID_STATE", "allocation requires an approved delivery order")
	}

	byID := make(map[int64]*document.DocumentLine, len(lines))
	for _, ln := range lines {
		byID[ln.ID] = ln
	}

	existing, err := u.docs.ListAllocations(ctx, id)
	if err != nil {
		return nil, err
	}
	allocatedByLine := make(map[int64]float64, len(existing))
	for _, a := range existing {
		allocatedByLine[a.DocLineID] += a.QtyAllocated
	}

	type resolved struct {
		line    *document.DocumentLine
		qtyBase float64
		idx     int // request-line index (kept for error details after sorting)
	}
	items := make([]resolved, 0, len(in.Lines))
	for i, li := range in.Lines {
		ln, ok := byID[li.LineID]
		if !ok {
			return nil, validationErr(fmt.Sprintf("lines[%d].line_id", i), "line is not part of this document")
		}
		if li.Qty <= 0 {
			return nil, validationErr(fmt.Sprintf("lines[%d].qty", i), "must be greater than 0")
		}
		qtyBase := li.Qty * ln.ConvFactor
		if qtyBase > ln.QtyRequest*ln.ConvFactor-allocatedByLine[ln.ID] {
			return nil, validationErr(fmt.Sprintf("lines[%d].qty", i), "exceeds the line's remaining unallocated quantity")
		}
		items = append(items, resolved{line: ln, qtyBase: qtyBase, idx: i})
	}
	// H-10: acquire the candidate-balance row locks in a deterministic global
	// order (ItemID, then line ID) so two concurrent allocations whose lines
	// reference overlapping items can never deadlock — every tx takes its locks
	// in the same order. The per-item ORDER BY is already in
	// ListAllocationCandidates; this sorts the cross-item order.
	sort.Slice(items, func(i, j int) bool {
		if items[i].line.ItemID != items[j].line.ItemID {
			return items[i].line.ItemID < items[j].line.ItemID
		}
		return items[i].line.ID < items[j].line.ID
	})

	var results []AllocationResult
	var shortages []ShortageDetail
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		for _, it := range items {
			candidates, err := u.cands.LockAllocationCandidates(txCtx, it.line.ItemID, doc.WarehouseID)
			if err != nil {
				return err
			}
			need := it.qtyBase
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
				if err := u.cands.UpdateBalanceReserved(txCtx, cand.BalanceID, take); err != nil {
					return err
				}
				alloc := &document.Allocation{
					DocLineID:    it.line.ID,
					BalanceID:    cand.BalanceID,
					QtyAllocated: take,
				}
				if err := u.docs.CreateAllocations(txCtx, []*document.Allocation{alloc}); err != nil {
					return err
				}
				results = append(results, AllocationResult{
					LineID:       it.line.ID,
					AllocationID: alloc.ID,
					BalanceID:    cand.BalanceID,
					LocationCode: cand.LocationCode,
					BatchID:      cand.BatchID,
					ExpiryDate:   cand.ExpiryDate,
					PickSeq:      cand.PickSeq,
					QtyAllocated: take,
				})
				need -= take
			}
			if need > 0 {
				shortages = append(shortages, ShortageDetail{
					Field:     fmt.Sprintf("lines[%d].qty", it.idx),
					SKU:       fmt.Sprintf("ITEM-%d", it.line.ItemID),
					Requested: it.qtyBase,
					Available: it.qtyBase - need,
				})
			}
		}
		if len(shortages) > 0 {
			return &apperr.AppError{
				Code:    "ERR_STOCK_INSUFFICIENT",
				Message: "Saldo bebas tidak mencukupi",
				Details: shortages,
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return results, nil
}

// AllocateOverride performs a manual allocation to specific balances (Fase 7.3).
// It is only reachable by users holding `outbound.override_allocation` (enforced
// by the router) and requires a reason_code which is persisted on the document.
func (u *OutboundUsecase) AllocateOverride(ctx context.Context, id int64, in OverrideInput) ([]AllocationResult, error) {
	if in.ReasonCode == "" {
		return nil, validationErr("reason_code", "required for override allocation")
	}
	if len(in.Lines) == 0 {
		return nil, validationErr("lines", "at least one line is required")
	}
	doc, lines, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	// C-02: the caller's warehouse must own the document before reserving stock.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return nil, err
	}
	if doc.DocType != document.DocTypeDO {
		return nil, apperr.New("ERR_NOT_FOUND", "delivery order not found")
	}
	if doc.Status != document.StatusApproved {
		return nil, apperr.New("ERR_INVALID_STATE", "allocation requires an approved delivery order")
	}

	byID := make(map[int64]*document.DocumentLine, len(lines))
	for _, ln := range lines {
		byID[ln.ID] = ln
	}

	existing, err := u.docs.ListAllocations(ctx, id)
	if err != nil {
		return nil, err
	}
	allocatedByLine := make(map[int64]float64, len(existing))
	for _, a := range existing {
		allocatedByLine[a.DocLineID] += a.QtyAllocated
	}

	type resolved struct {
		line      *document.DocumentLine
		qtyBase   float64
		balanceID int64
		idx       int // request-line index (kept for error details after sorting)
	}
	items := make([]resolved, 0, len(in.Lines))
	for i, li := range in.Lines {
		ln, ok := byID[li.LineID]
		if !ok {
			return nil, validationErr(fmt.Sprintf("lines[%d].line_id", i), "line is not part of this document")
		}
		if li.Qty <= 0 {
			return nil, validationErr(fmt.Sprintf("lines[%d].qty", i), "must be greater than 0")
		}
		if li.BalanceID <= 0 {
			return nil, validationErr(fmt.Sprintf("lines[%d].balance_id", i), "required for override allocation")
		}
		qtyBase := li.Qty * ln.ConvFactor
		if qtyBase > ln.QtyRequest*ln.ConvFactor-allocatedByLine[ln.ID] {
			return nil, validationErr(fmt.Sprintf("lines[%d].qty", i), "exceeds the line's remaining unallocated quantity")
		}
		items = append(items, resolved{line: ln, qtyBase: qtyBase, balanceID: li.BalanceID, idx: i})
	}
	// H-10: lock the override-target balances in a deterministic global order
	// (balanceID, then line ID) so concurrent overrides over overlapping
	// balances never deadlock (same rationale as Allocate above).
	sort.Slice(items, func(i, j int) bool {
		if items[i].balanceID != items[j].balanceID {
			return items[i].balanceID < items[j].balanceID
		}
		return items[i].line.ID < items[j].line.ID
	})

	var results []AllocationResult
	var shortages []ShortageDetail
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		for _, it := range items {
			cand, err := u.cands.GetCandidateByBalanceID(txCtx, it.balanceID, doc.WarehouseID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return validationErr(fmt.Sprintf("lines[%d].balance_id", it.idx), "balance is not allocatable in this warehouse")
				}
				return err
			}
			if cand.ItemID != it.line.ItemID {
				return validationErr(fmt.Sprintf("lines[%d].balance_id", it.idx), "balance item does not match the line item")
			}
			if it.qtyBase > cand.QtyFree {
				shortages = append(shortages, ShortageDetail{
					Field:     fmt.Sprintf("lines[%d].qty", it.idx),
					SKU:       fmt.Sprintf("ITEM-%d", it.line.ItemID),
					Requested: it.qtyBase,
					Available: cand.QtyFree,
				})
				continue
			}
			if err := u.cands.UpdateBalanceReserved(txCtx, cand.BalanceID, it.qtyBase); err != nil {
				return err
			}
			alloc := &document.Allocation{
				DocLineID:    it.line.ID,
				BalanceID:    cand.BalanceID,
				QtyAllocated: it.qtyBase,
			}
			if err := u.docs.CreateAllocations(txCtx, []*document.Allocation{alloc}); err != nil {
				return err
			}
			results = append(results, AllocationResult{
				LineID:       it.line.ID,
				AllocationID: alloc.ID,
				BalanceID:    cand.BalanceID,
				LocationCode: cand.LocationCode,
				BatchID:      cand.BatchID,
				ExpiryDate:   cand.ExpiryDate,
				PickSeq:      cand.PickSeq,
				QtyAllocated: it.qtyBase,
			})
		}
		if len(shortages) > 0 {
			return &apperr.AppError{
				Code:    "ERR_STOCK_INSUFFICIENT",
				Message: "Saldo bebas tidak mencukupi",
				Details: shortages,
			}
		}
		return u.docs.UpdateReasonCode(txCtx, id, in.ReasonCode)
	})
	if err != nil {
		return nil, err
	}
	return results, nil
}
