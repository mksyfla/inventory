package stock

import (
	"context"
	"time"
)

type StockStatus string

const (
	StatusAvailable  StockStatus = "available"
	StatusQuarantine StockStatus = "quarantine"
	StatusDamaged    StockStatus = "damaged"
	StatusExpired    StockStatus = "expired"
	StatusInTransit  StockStatus = "in_transit"
)

type MovementType string

const (
	TypeReceipt      MovementType = "receipt"
	TypeIssue        MovementType = "issue"
	TypeTransferOut  MovementType = "transfer_out"
	TypeTransferIn   MovementType = "transfer_in"
	TypeAdjustment   MovementType = "adjustment"
	TypePutaway      MovementType = "putaway"
	TypeInternalMove MovementType = "internal_move"
	TypeReturnIn     MovementType = "return_in"
	TypeReturnOut    MovementType = "return_out"
	TypeOpening      MovementType = "opening"
)

type StockBalance struct {
	ID          int64       `json:"id"`
	ItemID      int64       `json:"item_id"`
	LocationID  int64       `json:"location_id"`
	BatchID     *int64      `json:"batch_id"`
	Status      StockStatus `json:"status"`
	QtyOnhand   float64     `json:"qty_onhand"`
	QtyReserved float64     `json:"qty_reserved"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

type StockMovement struct {
	ID           int64        `json:"id"`
	MovedAt      time.Time    `json:"moved_at"`
	ItemID       int64        `json:"item_id"`
	LocationID   int64        `json:"location_id"`
	BatchID      *int64       `json:"batch_id"`
	Status       StockStatus  `json:"status"`
	MovementType MovementType `json:"movement_type"`
	Qty          float64      `json:"qty"`
	QtyAfter     float64      `json:"qty_after"`
	UnitCost     *float64     `json:"unit_cost"`
	DocLineID    int64        `json:"doc_line_id"`
	DocNo        string       `json:"doc_no"`
	CreatedBy    int64        `json:"created_by"`
}

type StockMovementInput struct {
	ItemID       int64        `json:"item_id"`
	LocationID   int64        `json:"location_id"`
	BatchID      *int64       `json:"batch_id"`
	Status       StockStatus  `json:"status"`
	MovementType MovementType `json:"movement_type"`
	Qty          float64      `json:"qty"` // (+) masuk, (-) keluar
	UnitCost     *float64     `json:"unit_cost"`
	DocLineID    int64        `json:"doc_line_id"`
	CreatedBy    int64        `json:"created_by"`
}

type BalanceKey struct {
	ItemID     int64
	LocationID int64
	BatchID    *int64
	Status     StockStatus
}

type MovementFilter struct {
	ItemID     int64
	StartDate  time.Time
	EndDate    time.Time
	Limit      int
	CursorID   *int64
	CursorTime *time.Time
}

// StockRepository defines interface for DB operations
type StockRepository interface {
	// GetBalancesForUpdate locks rows deterministically for locking to prevent deadlocks
	GetBalancesForUpdate(ctx context.Context, keys []BalanceKey) ([]*StockBalance, error)
	UpsertBalance(ctx context.Context, b *StockBalance) error
	InsertMovement(ctx context.Context, m *StockMovement) error
	GetMovements(ctx context.Context, filter MovementFilter) ([]*StockMovement, error)
}

// TxRunner defines interface for running database transactions cleanly
type TxRunner interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
}
