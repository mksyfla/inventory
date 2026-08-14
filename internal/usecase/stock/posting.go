package stock

import (
	"context"
	"fmt"
	"sort"
	"time"

	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"
)

type PostingUsecase struct {
	stockRepo stock.StockRepository
	txRunner  stock.TxRunner
}

func NewPostingUsecase(stockRepo stock.StockRepository, txRunner stock.TxRunner) *PostingUsecase {
	return &PostingUsecase{
		stockRepo: stockRepo,
		txRunner:  txRunner,
	}
}

type ShortageDetail struct {
	Field     string  `json:"field"`
	SKU       string  `json:"sku,omitempty"`
	Requested float64 `json:"requested"`
	Available float64 `json:"available"`
}

func (u *PostingUsecase) PostStockMovement(ctx context.Context, docNo string, inputs []stock.StockMovementInput) error {
	if len(inputs) == 0 {
		return nil
	}

	// 1. Gather all unique balance keys to lock
	keyMap := make(map[string]stock.BalanceKey)
	for _, in := range inputs {
		var batchID int64
		if in.BatchID != nil {
			batchID = *in.BatchID
		}
		keyStr := fmt.Sprintf("%d-%d-%d-%s", in.ItemID, in.LocationID, batchID, in.Status)
		keyMap[keyStr] = stock.BalanceKey{
			ItemID:     in.ItemID,
			LocationID: in.LocationID,
			BatchID:    in.BatchID,
			Status:     in.Status,
		}
	}

	keys := make([]stock.BalanceKey, 0, len(keyMap))
	for _, k := range keyMap {
		keys = append(keys, k)
	}

	// 2. Sort target balances deterministically to prevent deadlocks (FSD 4.1)
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].ItemID != keys[j].ItemID {
			return keys[i].ItemID < keys[j].ItemID
		}
		if keys[i].LocationID != keys[j].LocationID {
			return keys[i].LocationID < keys[j].LocationID
		}
		var batchI, batchJ int64
		if keys[i].BatchID != nil {
			batchI = *keys[i].BatchID
		}
		if keys[j].BatchID != nil {
			batchJ = *keys[j].BatchID
		}
		if batchI != batchJ {
			return batchI < batchJ
		}
		return keys[i].Status < keys[j].Status
	})

	// 3. Run in database transaction
	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		// 4. Lock balances in sorted deterministic order (SELECT ... FOR UPDATE)
		balances, err := u.stockRepo.GetBalancesForUpdate(txCtx, keys)
		if err != nil {
			return fmt.Errorf("failed to lock balances: %w", err)
		}

		// Map existing balances for easy lookup
		balMap := make(map[string]*stock.StockBalance)
		for _, b := range balances {
			var batchID int64
			if b.BatchID != nil {
				batchID = *b.BatchID
			}
			keyStr := fmt.Sprintf("%d-%d-%d-%s", b.ItemID, b.LocationID, batchID, b.Status)
			balMap[keyStr] = b
		}

		// 5. Process each movement input
		var shortages []ShortageDetail
		type updateBalanceJob struct {
			balance *stock.StockBalance
			qty     float64
			after   float64
		}
		jobs := make([]updateBalanceJob, 0, len(inputs))

		for i, in := range inputs {
			var batchID int64
			if in.BatchID != nil {
				batchID = *in.BatchID
			}
			keyStr := fmt.Sprintf("%d-%d-%d-%s", in.ItemID, in.LocationID, batchID, in.Status)

			bal, exists := balMap[keyStr]
			if !exists {
				bal = &stock.StockBalance{
					ItemID:      in.ItemID,
					LocationID:  in.LocationID,
					BatchID:     in.BatchID,
					Status:      in.Status,
					QtyOnhand:   0,
					QtyReserved: 0,
				}
				balMap[keyStr] = bal
			}

			newOnhand := bal.QtyOnhand + in.Qty
			// Validate negative stock constraints (BR-02 & FSD 4.1)
			if newOnhand < 0 {
				shortages = append(shortages, ShortageDetail{
					Field:     fmt.Sprintf("lines[%d].qty", i),
					SKU:       fmt.Sprintf("ITEM-%d", in.ItemID),
					Requested: -in.Qty,
					Available: bal.QtyOnhand,
				})
				continue
			}

			// Validate reserved stock constraints: qty_reserved <= qty_onhand (BR-07)
			if newOnhand < bal.QtyReserved {
				shortages = append(shortages, ShortageDetail{
					Field:     fmt.Sprintf("lines[%d].qty", i),
					SKU:       fmt.Sprintf("ITEM-%d", in.ItemID),
					Requested: -in.Qty,
					Available: bal.QtyOnhand - bal.QtyReserved,
				})
				continue
			}

			bal.QtyOnhand = newOnhand
			jobs = append(jobs, updateBalanceJob{
				balance: bal,
				qty:     in.Qty,
				after:   newOnhand,
			})
		}

		// 6. If any shortage occurs, abort and return ERR_STOCK_INSUFFICIENT
		if len(shortages) > 0 {
			return &apperr.AppError{
				Code:    "ERR_STOCK_INSUFFICIENT",
				Message: "Saldo bebas tidak mencukupi",
				Details: shortages,
			}
		}

		// 7. Execute all database writes (Upsert balances and Insert movements)
		for _, job := range jobs {
			err = u.stockRepo.UpsertBalance(txCtx, job.balance)
			if err != nil {
				return fmt.Errorf("failed to update stock balance: %w", err)
			}

			movement := &stock.StockMovement{
				MovedAt:      time.Now().UTC(),
				ItemID:       job.balance.ItemID,
				LocationID:   job.balance.LocationID,
				BatchID:      job.balance.BatchID,
				Status:       job.balance.Status,
				MovementType: inputs[0].MovementType,
				Qty:          job.qty,
				QtyAfter:     job.after,
				DocLineID:    inputs[0].DocLineID,
				DocNo:        docNo,
				CreatedBy:    inputs[0].CreatedBy,
			}

			err = u.stockRepo.InsertMovement(txCtx, movement)
			if err != nil {
				return fmt.Errorf("failed to insert stock movement ledger: %w", err)
			}
		}

		return nil
	})
}

// ListMovements retrieves historical movements utilizing keyset pagination filters.
func (u *PostingUsecase) ListMovements(ctx context.Context, filter stock.MovementFilter) ([]*stock.StockMovement, error) {
	return u.stockRepo.GetMovements(ctx, filter)
}
