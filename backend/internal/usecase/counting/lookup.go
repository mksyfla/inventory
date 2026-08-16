// Package counting implements the stock opname module (Fase 8.2-8.5 / FR-6.x):
// count sessions with blind qty_system snapshots, field count input, tiered
// approval for high-value variances and manual adjustments.
//
// The interfaces are consumer-side so the usecase stays testable with
// hand-rolled mocks; the postgres implementation lives in repository/postgres.
package counting

import (
	"context"
)

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

// ItemInfo is the master-item slice needed to validate adjustment lines.
type ItemInfo struct {
	ID       int64
	SKU      string
	BaseUom  string
	IsActive bool
}

// ItemLookup resolves items.
type ItemLookup interface {
	GetItemByID(ctx context.Context, id int64) (*ItemInfo, error)
}

// BalanceSnapshot is one row of the qty_system snapshot (FR-6.1): the
// current on-hand quantity of a countable (available) balance when the count
// session opens.
type BalanceSnapshot struct {
	ItemID     int64
	LocationID int64
	BatchID    *int64
	QtyOnhand  float64
}

// CountBalanceLookup reads the balances to snapshot.
type CountBalanceLookup interface {
	// ListSnapshotBalances returns available balances of a warehouse,
	// optionally narrowed by zone ("" = all) and item (0 = all).
	ListSnapshotBalances(ctx context.Context, warehouseID int64, zone string, itemID int64) ([]*BalanceSnapshot, error)
}

// ValueLookup prices count variances for the tiered-approval threshold
// (M6.4): the last known unit cost of an item from the ledger.
type ValueLookup interface {
	// LastUnitCost returns the item's latest unit_cost or pgx.ErrNoRows when
	// the ledger has no priced movement yet (treated as 0).
	LastUnitCost(ctx context.Context, itemID int64) (float64, error)
}
