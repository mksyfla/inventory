// Package inbound implements the inbound module (Fase 6: GRN + alur putaway).
//
// The interfaces below are the narrow slices of master data the receipt flow
// needs. They are defined here (consumer side) so the usecase stays testable
// with hand-rolled mocks; the postgres implementation lives in
// repository/postgres.
package inbound

import (
	"context"
	"time"
)

// ItemInfo is the master-item slice needed to validate a receipt line.
type ItemInfo struct {
	ID       int64
	SKU      string
	BaseUom  string
	IsBatch  bool
	IsExpiry bool
	IsActive bool
	ABCClass string
}

// ItemLookup resolves items and UoM conversion factors.
type ItemLookup interface {
	// GetItemByID returns the item or pgx.ErrNoRows when missing.
	GetItemByID(ctx context.Context, id int64) (*ItemInfo, error)
	// UomConvFactor returns the conversion factor of uom against the item's
	// base uom (base uom = 1). Unknown uom surfaces as pgx.ErrNoRows so the
	// caller can translate it to a validation error.
	UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error)
}

// WarehouseInfo is the master-warehouse slice needed to build the docnum.
type WarehouseInfo struct {
	ID       int64
	Code     string
	IsActive bool
}

// WarehouseLookup resolves the receiving warehouse.
type WarehouseLookup interface {
	// GetWarehouseByID returns the warehouse or pgx.ErrNoRows when missing.
	GetWarehouseByID(ctx context.Context, id int64) (*WarehouseInfo, error)
}

// LocationInfo is a master.locations row (loc_type + capacity relevant here).
type LocationInfo struct {
	ID         int64
	WarehouseID int64
	Code       string
	Zone       string
	Rack       string
	Level      string
	LocType    string
	PickSeq    *int
	Capacity   *float64
}

// PutawayCandidate is a target location with its current usage.
type PutawayCandidate struct {
	Location LocationInfo
	UsedQty  float64
}

// LocationStore resolves staging and putaway target locations.
type LocationStore interface {
	// GetStaging returns the warehouse's active staging location or
	// pgx.ErrNoRows when none is configured.
	GetStaging(ctx context.Context, warehouseID int64) (*LocationInfo, error)
	// GetByWarehouseCode returns an active location by its code inside the
	// warehouse, or pgx.ErrNoRows.
	GetByWarehouseCode(ctx context.Context, warehouseID int64, code string) (*LocationInfo, error)
	// PutawayCandidates lists active pick/bulk locations with the quantity
	// already stored in each (used for capacity checks).
	PutawayCandidates(ctx context.Context, warehouseID int64) ([]*PutawayCandidate, error)
}

// BatchInfo is a master.batches row.
type BatchInfo struct {
	ID         int64
	ItemID     int64
	BatchNo    string
	ExpiryDate *time.Time
}

// BatchStore resolves or creates production batches (FSD 4.2 FEFO basis).
type BatchStore interface {
	// GetByItemAndNo returns the batch or pgx.ErrNoRows.
	GetByItemAndNo(ctx context.Context, itemID int64, batchNo string) (*BatchInfo, error)
	// Create inserts a new batch and returns it with its ID.
	Create(ctx context.Context, itemID int64, batchNo string, expiryDate *time.Time) (*BatchInfo, error)
}
