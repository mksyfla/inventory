package counting

import (
	"context"
	"errors"
	"fmt"

	"inventory/internal/domain/document"
	"inventory/internal/domain/stock"

	"github.com/jackc/pgx/v5"
)

// AdjustmentLineInput is one direct stock adjustment (Fase 8.5).
type AdjustmentLineInput struct {
	ItemID     int64
	LocationID int64
	BatchID    *int64
	Qty        float64 // bertanda: (+) menambah saldo, (-) mengurangi saldo
	Status     string  // available | damaged | quarantine (default available)
	ReasonCode string
}

// CreateAdjustmentInput is the payload of POST /adjustments (FR-6.5).
// reason_code and a written explanation (notes) are mandatory.
type CreateAdjustmentInput struct {
	WarehouseID    int64
	ReasonCode     string
	Notes          string
	IdempotencyKey string
	CreatedBy      int64
	Lines          []AdjustmentLineInput
}

// validAdjustmentStatuses are the balance statuses an adjustment may target.
var validAdjustmentStatuses = map[string]bool{
	"available":  true,
	"damaged":    true,
	"quarantine": true,
}

// CreateAdjustment posts a direct adjustment outside a stock opname (FR-6.5,
// e.g. damaged/lost goods discovered suddenly). The ADJ document, the ledger
// movements (type adjustment) and the completed status are written in one
// transaction. A repeated Idempotency-Key returns the existing document.
func (u *CountingUsecase) CreateAdjustment(ctx context.Context, in CreateAdjustmentInput) (*document.Document, error) {
	if in.ReasonCode == "" {
		return nil, validationErr("reason_code", "required for manual adjustments")
	}
	if len(in.ReasonCode) > 30 {
		return nil, validationErr("reason_code", "must be at most 30 characters")
	}
	if in.Notes == "" {
		return nil, validationErr("notes", "a written explanation is required")
	}
	if len(in.Lines) == 0 {
		return nil, validationErr("lines", "at least one line is required")
	}

	if in.IdempotencyKey != "" {
		existing, err := u.docs.GetByIDempotencyKey(ctx, in.IdempotencyKey)
		if err == nil {
			return existing, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}

	wh, err := u.wh.GetWarehouseByID(ctx, in.WarehouseID)
	if err != nil {
		return nil, err
	}
	if !wh.IsActive {
		return nil, validationErr("warehouse_id", "warehouse is inactive")
	}

	type prep struct {
		in     AdjustmentLineInput
		status stock.StockStatus
	}
	preps := make([]prep, 0, len(in.Lines))
	for i, ln := range in.Lines {
		if ln.Qty == 0 {
			return nil, validationErr(fmt.Sprintf("lines[%d].qty", i), "must not be zero")
		}
		status := stock.StockStatus(ln.Status)
		if ln.Status == "" {
			status = stock.StatusAvailable
		}
		if !validAdjustmentStatuses[string(status)] {
			return nil, validationErr(fmt.Sprintf("lines[%d].status", i), "must be one of [available damaged quarantine]")
		}
		if _, err := u.items.GetItemByID(ctx, ln.ItemID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, validationErr(fmt.Sprintf("lines[%d].item_id", i), "unknown item")
			}
			return nil, err
		}
		if ln.LocationID <= 0 {
			return nil, validationErr(fmt.Sprintf("lines[%d].location_id", i), "required")
		}
		preps = append(preps, prep{in: ln, status: status})
	}

	var doc *document.Document
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		docNo, err := u.gen.Next(txCtx, document.DocTypeAdjust.String(), wh.Code, u.now())
		if err != nil {
			return err
		}
		doc = &document.Document{
			DocNo:          docNo,
			DocType:        document.DocTypeAdjust,
			DocDate:        u.now(),
			Status:         document.StatusDraft,
			WarehouseID:    wh.ID,
			ReasonCode:     &in.ReasonCode,
			IdempotencyKey: strPtr(in.IdempotencyKey),
			Notes:          &in.Notes,
			CreatedBy:      in.CreatedBy,
		}
		if err := u.docs.Create(txCtx, doc, nil); err != nil {
			return err
		}

		movements := make([]stock.StockMovementInput, 0, len(preps))
		for _, p := range preps {
			movements = append(movements, stock.StockMovementInput{
				ItemID:       p.in.ItemID,
				LocationID:   p.in.LocationID,
				BatchID:      p.in.BatchID,
				Status:       p.status,
				MovementType: stock.TypeAdjustment,
				Qty:          p.in.Qty,
				DocLineID:    0, // adjustment bukan baris dokumen (nullable di ledger)
				CreatedBy:    in.CreatedBy,
			})
		}
		if err := u.posting.PostStockMovementInTx(txCtx, doc.DocNo, movements); err != nil {
			return err
		}

		// ADJ diposting langsung (adj.create + reason_code adalah kontrolnya):
		// validasi seluruh transisi state machine, persist status akhir completed.
		status := document.StatusDraft
		for _, next := range []document.Status{
			document.StatusSubmitted,
			document.StatusApproved,
			document.StatusInProgress,
			document.StatusCompleted,
		} {
			status, err = status.Transition(next)
			if err != nil {
				return err
			}
		}
		if err := u.docs.UpdateStatus(txCtx, doc.ID, status, nil); err != nil {
			return err
		}
		doc.Status = status
		return nil
	})
	if err != nil {
		return nil, err
	}
	return doc, nil
}
