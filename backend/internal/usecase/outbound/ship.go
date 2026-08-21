package outbound

import (
	"context"
	"fmt"
	"sort"

	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/authz"
)

// ShipInput carries the shipping/surat jalan data (FR-4.5).
type ShipInput struct {
	VehicleNo  string
	DriverName string
}

// Ship posts the picked quantities as issue movements (Fase 7.6): it releases
// the reservation on every affected balance, reduces qty_onhand + qty_reserved,
// writes the negative ledger rows and moves the document approved →
// in_progress. Everything runs in one transaction (FSD 4.1).
func (u *OutboundUsecase) Ship(ctx context.Context, id int64, in ShipInput) (document.Status, error) {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return "", err
	}
	// C-02: the caller's warehouse must own the document before posting the issue.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return "", err
	}
	if doc.DocType != document.DocTypeDO {
		return "", apperr.New("ERR_NOT_FOUND", "delivery order not found")
	}
	if doc.Status != document.StatusApproved {
		return "", apperr.New("ERR_INVALID_STATE", "shipping requires an approved delivery order")
	}

	allocs, err := u.docs.ListAllocations(ctx, id)
	if err != nil {
		return "", err
	}

	// Aggregate picked quantity per balance and build one issue movement per
	// picked allocation (FSD §4.2: ledger rows reference the doc line).
	type release struct {
		balanceID int64
		itemID    int64
		location  int64
		batchID   *int64
		qty       float64
	}
	var releases []release
	keyOf := func(itemID, location int64, batch *int64) string {
		b := int64(0)
		if batch != nil {
			b = *batch
		}
		return fmt.Sprintf("%d-%d-%d", itemID, location, b)
	}
	byKey := make(map[string]int)
	movements := make([]stock.StockMovementInput, 0, len(allocs))
	for _, a := range allocs {
		if a.QtyPicked <= 0 {
			continue
		}
		k := keyOf(a.ItemID, a.LocationID, a.BatchID)
		if idx, ok := byKey[k]; ok {
			releases[idx].qty += a.QtyPicked
		} else {
			byKey[k] = len(releases)
			releases = append(releases, release{
				balanceID: a.BalanceID,
				itemID:    a.ItemID,
				location:  a.LocationID,
				batchID:   a.BatchID,
				qty:       a.QtyPicked,
			})
		}
		movements = append(movements, stock.StockMovementInput{
			ItemID:       a.ItemID,
			LocationID:   a.LocationID,
			BatchID:      a.BatchID,
			Status:       stock.StatusAvailable,
			MovementType: stock.TypeIssue,
			Qty:          -a.QtyPicked,
			DocLineID:    a.DocLineID,
			CreatedBy:    0,
		})
	}
	if len(releases) == 0 {
		return "", validationErr("pick", "nothing has been picked; run POST /deliveries/{id}/pick first")
	}

	// Deterministic lock order matching the posting engine
	// (item, location, batch) prevents deadlocks between concurrent ships.
	sort.Slice(releases, func(i, j int) bool {
		if releases[i].itemID != releases[j].itemID {
			return releases[i].itemID < releases[j].itemID
		}
		if releases[i].location != releases[j].location {
			return releases[i].location < releases[j].location
		}
		bi, bj := int64(0), int64(0)
		if releases[i].batchID != nil {
			bi = *releases[i].batchID
		}
		if releases[j].batchID != nil {
			bj = *releases[j].batchID
		}
		return bi < bj
	})

	next, err := doc.Status.Transition(document.StatusInProgress)
	if err != nil {
		return "", err
	}

	now := u.now()
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		// Release reservations in the same deterministic order we locked.
		for _, r := range releases {
			if err := u.stock.UpdateBalanceReserved(txCtx, r.balanceID, -r.qty); err != nil {
				return err
			}
		}
		// Post the issue ledger rows (reduces qty_onhand, qty_after recorded).
		if err := u.posting.PostStockMovementInTx(txCtx, doc.DocNo, movements); err != nil {
			return err
		}
		if err := u.docs.UpsertDelivery(txCtx, &document.Delivery{
			DocumentID: id,
			VehicleNo:  strPtr(in.VehicleNo),
			DriverName: strPtr(in.DriverName),
			ShippedAt:  &now,
		}); err != nil {
			return err
		}
		// H-04: only one ship may issue the stock — a concurrent ship that
		// already moved the doc to in_progress wins; the loser rolls back so
		// it never double-posts the issue ledger rows above.
		ok, err := u.docs.TransitionStatus(txCtx, id, doc.Status, next, nil)
		if err != nil {
			return err
		}
		if !ok {
			return apperr.New("ERR_CONFLICT", "delivery order was already shipped")
		}
		return nil
	})
	return next, err
}
