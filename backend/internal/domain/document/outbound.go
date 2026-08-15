package document

import "time"

// Allocation is one reserved stock slice of a document line
// (doc.allocations, Fase 7.2). Qty is always in the item's base UOM because it
// is deducted from inv.stock_balances, which stores base UOM.
type Allocation struct {
	ID           int64
	DocLineID    int64
	BalanceID    int64
	QtyAllocated float64
	QtyPicked    float64
	// Enrichment from ListAllocations (picking list / scan verification):
	ItemID       int64
	LocationID   int64
	BatchID      *int64
	LocationCode string
	PickSeq      *int
	BatchNo      string
	ExpiryDate   *time.Time
	SKU          string
	BaseUom      string
}

// Remaining returns how much of the allocation has not been picked yet.
func (a *Allocation) Remaining() float64 {
	r := a.QtyAllocated - a.QtyPicked
	if r < 0 {
		return 0
	}
	return r
}

// Delivery carries the outbound fulfilment data of a DO (doc.deliveries,
// Fase 7.6/7.7).
type Delivery struct {
	DocumentID   int64
	VehicleNo    *string
	DriverName   *string
	ShippedAt    *time.Time
	ReceivedBy   *string
	ReceivedAt   *time.Time
	PodFileURL   *string
	SignatureURL *string
}
