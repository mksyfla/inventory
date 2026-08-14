package dto

import "time"

// StockMovementResponse is the serialized record return for keyset pagination.
type StockMovementResponse struct {
	ID           int64     `json:"id"`
	MovedAt      time.Time `json:"moved_at"`
	ItemID       int64     `json:"item_id"`
	LocationID   int64     `json:"location_id"`
	BatchID      *int64    `json:"batch_id"`
	Status       string    `json:"status"`
	MovementType string    `json:"movement_type"`
	Qty          float64   `json:"qty"`
	QtyAfter     float64   `json:"qty_after"`
	DocNo        string    `json:"doc_no"`
}

// StockMovementListResponse wraps the array of movements and keyset pagination meta.
type StockMovementListResponse struct {
	Data       []StockMovementResponse `json:"data"`
	NextCursor string                  `json:"next_cursor"` // Base64 encoded keyset cursor (moved_at + id)
}
