package stock

import (
	"context"
	"fmt"
	"testing"

	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"

	"github.com/stretchr/testify/assert"
)

type mockStockRepo struct {
	balances  map[string]*stock.StockBalance
	movements []*stock.StockMovement
	locked    []stock.BalanceKey
}

func newMockStockRepo() *mockStockRepo {
	return &mockStockRepo{
		balances:  make(map[string]*stock.StockBalance),
		movements: make([]*stock.StockMovement, 0),
	}
}

func (m *mockStockRepo) GetBalancesForUpdate(ctx context.Context, keys []stock.BalanceKey) ([]*stock.StockBalance, error) {
	m.locked = append(m.locked, keys...)
	var result []*stock.StockBalance
	for _, key := range keys {
		var batchID int64
		if key.BatchID != nil {
			batchID = *key.BatchID
		}
		keyStr := fmt.Sprintf("%d-%d-%d-%s", key.ItemID, key.LocationID, batchID, key.Status)
		if bal, exists := m.balances[keyStr]; exists {
			copyBal := *bal
			result = append(result, &copyBal)
		}
	}
	return result, nil
}

func (m *mockStockRepo) UpsertBalance(ctx context.Context, b *stock.StockBalance) error {
	var batchID int64
	if b.BatchID != nil {
		batchID = *b.BatchID
	}
	keyStr := fmt.Sprintf("%d-%d-%d-%s", b.ItemID, b.LocationID, batchID, b.Status)
	copyBal := *b
	m.balances[keyStr] = &copyBal
	return nil
}

func (m *mockStockRepo) InsertMovement(ctx context.Context, mov *stock.StockMovement) error {
	m.movements = append(m.movements, mov)
	return nil
}

func (m *mockStockRepo) GetMovements(ctx context.Context, filter stock.MovementFilter) ([]*stock.StockMovement, error) {
	return m.movements, nil
}

type mockTxRunner struct {
	shouldRollback bool
}

func (r *mockTxRunner) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	err := fn(ctx)
	if err != nil {
		r.shouldRollback = true
		return err
	}
	return nil
}

func TestPostStockMovement_HappyInbound(t *testing.T) {
	repo := newMockStockRepo()
	tx := &mockTxRunner{}
	usecase := NewPostingUsecase(repo, tx)

	var batchID int64 = 100
	inputs := []stock.StockMovementInput{
		{
			ItemID:       1,
			LocationID:   10,
			BatchID:      &batchID,
			Status:       stock.StatusAvailable,
			MovementType: stock.TypeReceipt,
			Qty:          50.0,
			DocLineID:    500,
			CreatedBy:    99,
		},
	}

	err := usecase.PostStockMovement(context.Background(), "GRN-001", inputs)
	assert.NoError(t, err)
	assert.False(t, tx.shouldRollback)

	// Verify stock balances updated correctly
	keyStr := "1-10-100-available"
	bal, exists := repo.balances[keyStr]
	assert.True(t, exists)
	assert.Equal(t, 50.0, bal.QtyOnhand)
	assert.Equal(t, 0.0, bal.QtyReserved)

	// Verify ledger movements registered correctly
	assert.Len(t, repo.movements, 1)
	mov := repo.movements[0]
	assert.Equal(t, int64(1), mov.ItemID)
	assert.Equal(t, int64(10), mov.LocationID)
	assert.Equal(t, &batchID, mov.BatchID)
	assert.Equal(t, stock.StatusAvailable, mov.Status)
	assert.Equal(t, stock.TypeReceipt, mov.MovementType)
	assert.Equal(t, 50.0, mov.Qty)
	assert.Equal(t, 50.0, mov.QtyAfter)
	assert.Equal(t, "GRN-001", mov.DocNo)
}

func TestPostStockMovement_HappyOutbound(t *testing.T) {
	repo := newMockStockRepo()
	tx := &mockTxRunner{}
	usecase := NewPostingUsecase(repo, tx)

	// Initialize balance with 100 onhand
	var batchID int64 = 100
	repo.balances["1-10-100-available"] = &stock.StockBalance{
		ID:          1,
		ItemID:      1,
		LocationID:  10,
		BatchID:     &batchID,
		Status:      stock.StatusAvailable,
		QtyOnhand:   100.0,
		QtyReserved: 20.0,
	}

	inputs := []stock.StockMovementInput{
		{
			ItemID:       1,
			LocationID:   10,
			BatchID:      &batchID,
			Status:       stock.StatusAvailable,
			MovementType: stock.TypeIssue,
			Qty:          -30.0, // Deduct 30
			DocLineID:    600,
			CreatedBy:    99,
		},
	}

	err := usecase.PostStockMovement(context.Background(), "DO-001", inputs)
	assert.NoError(t, err)
	assert.False(t, tx.shouldRollback)

	bal := repo.balances["1-10-100-available"]
	assert.Equal(t, 70.0, bal.QtyOnhand)
	assert.Equal(t, 20.0, bal.QtyReserved)

	assert.Len(t, repo.movements, 1)
	assert.Equal(t, -30.0, repo.movements[0].Qty)
	assert.Equal(t, 70.0, repo.movements[0].QtyAfter)
}

func TestPostStockMovement_InsufficientStock(t *testing.T) {
	repo := newMockStockRepo()
	tx := &mockTxRunner{}
	usecase := NewPostingUsecase(repo, tx)

	// Initial stock is 20
	var batchID int64 = 100
	repo.balances["1-10-100-available"] = &stock.StockBalance{
		ID:          1,
		ItemID:      1,
		LocationID:  10,
		BatchID:     &batchID,
		Status:      stock.StatusAvailable,
		QtyOnhand:   20.0,
		QtyReserved: 0.0,
	}

	inputs := []stock.StockMovementInput{
		{
			ItemID:       1,
			LocationID:   10,
			BatchID:      &batchID,
			Status:       stock.StatusAvailable,
			MovementType: stock.TypeIssue,
			Qty:          -50.0, // request deduction of 50
			DocLineID:    600,
			CreatedBy:    99,
		},
	}

	err := usecase.PostStockMovement(context.Background(), "DO-002", inputs)
	assert.Error(t, err)
	assert.True(t, tx.shouldRollback)

	appErr, ok := err.(*apperr.AppError)
	assert.True(t, ok)
	assert.Equal(t, "ERR_STOCK_INSUFFICIENT", appErr.Code)

	details, ok := appErr.Details.([]ShortageDetail)
	assert.True(t, ok)
	assert.Len(t, details, 1)
	assert.Equal(t, "lines[0].qty", details[0].Field)
	assert.Equal(t, "ITEM-1", details[0].SKU)
	assert.Equal(t, 50.0, details[0].Requested)
	assert.Equal(t, 20.0, details[0].Available)
}

func TestPostStockMovement_EncroachReservedStock(t *testing.T) {
	repo := newMockStockRepo()
	tx := &mockTxRunner{}
	usecase := NewPostingUsecase(repo, tx)

	// Onhand = 50, Reserved = 40. Available free stock = 10.
	var batchID int64 = 100
	repo.balances["1-10-100-available"] = &stock.StockBalance{
		ID:          1,
		ItemID:      1,
		LocationID:  10,
		BatchID:     &batchID,
		Status:      stock.StatusAvailable,
		QtyOnhand:   50.0,
		QtyReserved: 40.0,
	}

	inputs := []stock.StockMovementInput{
		{
			ItemID:       1,
			LocationID:   10,
			BatchID:      &batchID,
			Status:       stock.StatusAvailable,
			MovementType: stock.TypeIssue,
			Qty:          -15.0, // request deduction of 15 (exceeds free stock of 10)
			DocLineID:    600,
			CreatedBy:    99,
		},
	}

	err := usecase.PostStockMovement(context.Background(), "DO-003", inputs)
	assert.Error(t, err)

	appErr, ok := err.(*apperr.AppError)
	assert.True(t, ok)
	assert.Equal(t, "ERR_STOCK_INSUFFICIENT", appErr.Code)

	details, ok := appErr.Details.([]ShortageDetail)
	assert.True(t, ok)
	assert.Len(t, details, 1)
	assert.Equal(t, 10.0, details[0].Available) // only 10 available free stock
}

func TestPostStockMovement_DeterministicSorting(t *testing.T) {
	repo := newMockStockRepo()
	tx := &mockTxRunner{}
	usecase := NewPostingUsecase(repo, tx)

	var batch1 int64 = 50
	var batch2 int64 = 80

	// We pass items unsorted to the usecase
	inputs := []stock.StockMovementInput{
		{ItemID: 2, LocationID: 20, BatchID: &batch2, Status: stock.StatusAvailable},
		{ItemID: 1, LocationID: 30, BatchID: &batch1, Status: stock.StatusAvailable},
		{ItemID: 1, LocationID: 10, BatchID: &batch1, Status: stock.StatusAvailable},
		{ItemID: 2, LocationID: 20, BatchID: &batch1, Status: stock.StatusAvailable},
	}

	err := usecase.PostStockMovement(context.Background(), "DOC-009", inputs)
	assert.NoError(t, err)

	// Verify that repo.GetBalancesForUpdate was called with elements sorted deterministically:
	// Sorting priority: ItemID ascending -> LocationID ascending -> BatchID ascending -> Status ascending
	assert.NotEmpty(t, repo.locked)
	assert.Len(t, repo.locked, 4)

	// Expected sorted list:
	// 1. ItemID=1, LocationID=10, BatchID=50
	// 2. ItemID=1, LocationID=30, BatchID=50
	// 3. ItemID=2, LocationID=20, BatchID=50
	// 4. ItemID=2, LocationID=20, BatchID=80
	assert.Equal(t, int64(1), repo.locked[0].ItemID)
	assert.Equal(t, int64(10), repo.locked[0].LocationID)
	assert.Equal(t, int64(50), *repo.locked[0].BatchID)

	assert.Equal(t, int64(1), repo.locked[1].ItemID)
	assert.Equal(t, int64(30), repo.locked[1].LocationID)
	assert.Equal(t, int64(50), *repo.locked[1].BatchID)

	assert.Equal(t, int64(2), repo.locked[2].ItemID)
	assert.Equal(t, int64(20), repo.locked[2].LocationID)
	assert.Equal(t, int64(50), *repo.locked[2].BatchID)

	assert.Equal(t, int64(2), repo.locked[3].ItemID)
	assert.Equal(t, int64(20), repo.locked[3].LocationID)
	assert.Equal(t, int64(80), *repo.locked[3].BatchID)
}
