// Package outbound implements the outbound module (Fase 7: requests, delivery
// orders, FEFO/FIFO allocation, picking and proof-of-delivery).
//
// The interfaces below are the narrow slices of master data and stock the
// outbound flow needs. They are defined here (consumer side) so the usecase
// stays testable with hand-rolled mocks; the postgres implementation lives in
// repository/postgres.
package outbound

import (
	"context"
	"time"

	"inventory/internal/domain/stock"
)

// ItemInfo is the master-item slice needed to validate an outbound line.
type ItemInfo struct {
	ID       int64
	SKU      string
	BaseUom  string
	IsBatch  bool
	IsActive bool
}

// BarcodeItem is the master data resolved from a scanned barcode
// (master.item_uoms.barcode) for pick verification (FR-4.4).
type BarcodeItem struct {
	ItemID     int64
	SKU        string
	BaseUom    string
	Uom        string
	ConvFactor float64
}

// ItemLookup resolves items, UoM conversion factors and barcodes.
type ItemLookup interface {
	// GetItemByID returns the item or pgx.ErrNoRows when missing.
	GetItemByID(ctx context.Context, id int64) (*ItemInfo, error)
	// UomConvFactor returns the conversion factor of uom against the item's
	// base uom (base uom = 1). Unknown uom surfaces as pgx.ErrNoRows.
	UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error)
	// GetItemByBarcode resolves a scanned barcode to item + uom, or
	// pgx.ErrNoRows when the barcode is unknown.
	GetItemByBarcode(ctx context.Context, barcode string) (*BarcodeItem, error)
}

// WarehouseInfo is the master-warehouse slice needed to build the docnum.
type WarehouseInfo struct {
	ID       int64
	Code     string
	IsActive bool
}

// WarehouseLookup resolves the outbound warehouse.
type WarehouseLookup interface {
	// GetWarehouseByID returns the warehouse or pgx.ErrNoRows when missing.
	GetWarehouseByID(ctx context.Context, id int64) (*WarehouseInfo, error)
}

// LocationInfo is the master.locations slice needed for scan verification.
type LocationInfo struct {
	ID          int64
	WarehouseID int64
	Code        string
	LocType     string
}

// LocationLookup resolves a location by its code inside a warehouse.
type LocationLookup interface {
	// GetByWarehouseCode returns an active location by code, or pgx.ErrNoRows.
	GetByWarehouseCode(ctx context.Context, warehouseID int64, code string) (*LocationInfo, error)
}

// AllocationCandidate is a locked, allocatable balance slice (FSD §4.2).
// QtyFree is the currently available (not reserved) on-hand quantity.
type AllocationCandidate struct {
	BalanceID    int64
	ItemID       int64
	LocationID   int64
	BatchID      *int64
	QtyFree      float64
	LocationCode string
	PickSeq      *int
	ExpiryDate   *time.Time
}

// StockCandidates provides the allocation engine its race-safe data access.
// Every method must run inside the caller's transaction so the SELECT ... FOR
// UPDATE locks and the follow-up reservation writes commit atomically.
type StockCandidates interface {
	// LockAllocationCandidates locks FEFO/FIFO candidates of an item in a
	// warehouse (FSD §4.2, ordered, FOR UPDATE).
	LockAllocationCandidates(ctx context.Context, itemID, warehouseID int64) ([]*AllocationCandidate, error)
	// GetCandidateByBalanceID locks one specific candidate for the manual
	// override path (Fase 7.3), or pgx.ErrNoRows when it is not allocatable.
	GetCandidateByBalanceID(ctx context.Context, balanceID, warehouseID int64) (*AllocationCandidate, error)
	// UpdateBalanceReserved atomically adds delta to qty_reserved on an
	// already-locked balance.
	UpdateBalanceReserved(ctx context.Context, balanceID int64, delta float64) error
}

// BalanceLock locks and reads the exact balances being shipped so the ledger
// posting in Ship stays race-safe (deterministic key ordering, FSD 4.1).
type BalanceLock interface {
	GetBalancesForUpdate(ctx context.Context, keys []stock.BalanceKey) ([]*stock.StockBalance, error)
}
