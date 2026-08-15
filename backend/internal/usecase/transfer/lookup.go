// Package transfer implements the inter-warehouse transfer module
// (Fase 8.1 / FR-5.1): TRF documents, outbound send (in_transit) and
// inbound receive with discrepancy logging.
//
// The interfaces below are the narrow slices of master data, stock and
// documents the transfer flow needs, defined consumer-side so the usecase
// stays testable with hand-rolled mocks; the postgres implementation lives
// in repository/postgres.
package transfer

import (
	"context"
)

// ItemInfo is the master-item slice needed to validate a transfer line.
type ItemInfo struct {
	ID       int64
	SKU      string
	BaseUom  string
	IsBatch  bool
	IsActive bool
}

// ItemLookup resolves items and UoM conversion factors.
type ItemLookup interface {
	// GetItemByID returns the item or pgx.ErrNoRows when missing.
	GetItemByID(ctx context.Context, id int64) (*ItemInfo, error)
	// UomConvFactor returns the conversion factor of uom against the item's
	// base uom (base uom = 1). Unknown uom surfaces as pgx.ErrNoRows.
	UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error)
}

// WarehouseInfo is the master-warehouse slice needed to build the docnum.
type WarehouseInfo struct {
	ID       int64
	Code     string
	IsActive bool
}

// WarehouseLookup resolves warehouses.
type WarehouseLookup interface {
	GetWarehouseByID(ctx context.Context, id int64) (*WarehouseInfo, error)
}

// LocationInfo is the master.locations slice needed for receive validation.
type LocationInfo struct {
	ID          int64
	WarehouseID int64
	Code        string
	LocType     string
	IsActive    bool
}

// LocationLookup resolves storage and transit locations.
type LocationLookup interface {
	// GetLocationByID returns the location or pgx.ErrNoRows.
	GetLocationByID(ctx context.Context, id int64) (*LocationInfo, error)
	// GetTransitLocation returns the transit bin of a warehouse (where
	// in_transit balances live), or pgx.ErrNoRows when none is configured.
	GetTransitLocation(ctx context.Context, warehouseID int64) (*LocationInfo, error)
}

// Candidate is a locked, shippable balance slice of the source warehouse
// (FEFO/FIFO order, same query as the outbound allocation engine).
type Candidate struct {
	BalanceID  int64
	ItemID     int64
	LocationID int64
	BatchID    *int64
	QtyFree    float64
}

// CandidateLookup locks transfer candidates inside the caller's transaction
// (SELECT ... FOR UPDATE) so concurrent sends cannot oversell the source.
type CandidateLookup interface {
	LockCandidates(ctx context.Context, itemID, warehouseID int64) ([]*Candidate, error)
}
