package postgres

import (
	"context"
	"fmt"
	"net/netip"

	"inventory/internal/usecase/counting"
	"inventory/internal/usecase/transfer"

	"github.com/jackc/pgx/v5/pgtype"
)

// TransferLookup implements the transfer usecase's master-data, stock and
// audit lookups (items, warehouses, locations, FEFO candidates, audit logs).
// Every method honors an active transaction in ctx (GetTx) so the transfer
// usecase locks candidates and writes receipts/audit inside its own
// transaction.
type TransferLookup struct {
	queries *Queries
}

// NewTransferLookup wires the transfer lookups on the sqlc Queries.
func NewTransferLookup(q *Queries) *TransferLookup {
	return &TransferLookup{queries: q}
}

func (r *TransferLookup) querier(ctx context.Context) *Queries {
	if tx := GetTx(ctx); tx != nil {
		return r.queries.WithTx(tx)
	}
	return r.queries
}

// ─── transfer.ItemLookup ─────────────────────────────────────────────────────

func (r *TransferLookup) GetItemByID(ctx context.Context, id int64) (*transfer.ItemInfo, error) {
	row, err := r.querier(ctx).GetItemByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &transfer.ItemInfo{
		ID:       row.ID,
		SKU:      row.Sku,
		BaseUom:  row.BaseUom,
		IsBatch:  row.IsBatch,
		IsActive: row.IsActive,
	}, nil
}

func (r *TransferLookup) UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error) {
	rows, err := r.querier(ctx).ListItemUoMs(ctx, itemID)
	if err != nil {
		return 0, err
	}
	for _, row := range rows {
		if row.Uom == uom {
			f, err := row.ConvFactor.Float64Value()
			if err != nil {
				return 0, fmt.Errorf("postgres: bad conv_factor for item %d uom %q: %w", itemID, uom, err)
			}
			return f.Float64, nil
		}
	}
	return 0, errNotFound
}

// ─── transfer.WarehouseLookup ────────────────────────────────────────────────

func (r *TransferLookup) GetWarehouseByID(ctx context.Context, id int64) (*transfer.WarehouseInfo, error) {
	row, err := r.querier(ctx).GetWarehouseByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &transfer.WarehouseInfo{
		ID:       row.ID,
		Code:     row.Code,
		IsActive: row.IsActive,
	}, nil
}

// ─── transfer.LocationLookup ─────────────────────────────────────────────────

func (r *TransferLookup) GetLocationByID(ctx context.Context, id int64) (*transfer.LocationInfo, error) {
	row, err := r.querier(ctx).GetLocationByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &transfer.LocationInfo{
		ID:          row.ID,
		WarehouseID: row.WarehouseID,
		Code:        row.Code,
		LocType:     fmt.Sprint(row.LocType),
		IsActive:    row.IsActive,
	}, nil
}

func (r *TransferLookup) GetTransitLocation(ctx context.Context, warehouseID int64) (*transfer.LocationInfo, error) {
	row, err := r.querier(ctx).GetTransitLocation(ctx, warehouseID)
	if err != nil {
		return nil, err
	}
	return &transfer.LocationInfo{
		ID:          row.ID,
		WarehouseID: row.WarehouseID,
		Code:        row.Code,
		LocType:     fmt.Sprint(row.LocType),
		IsActive:    row.IsActive,
	}, nil
}

// ─── transfer.CandidateLookup ────────────────────────────────────────────────

// LockCandidates reuses the FEFO/FIFO candidate query of the outbound
// allocation engine (expiry NULLS LAST, id, pick_seq — FOR UPDATE OF b) so a
// transfer send and a delivery allocation can never oversell the same stock.
func (r *TransferLookup) LockCandidates(ctx context.Context, itemID, warehouseID int64) ([]*transfer.Candidate, error) {
	rows, err := r.querier(ctx).ListAllocationCandidates(ctx, ListAllocationCandidatesParams{
		ItemID:      itemID,
		WarehouseID: warehouseID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]*transfer.Candidate, 0, len(rows))
	for _, row := range rows {
		cand, err := transferCandidateFromRow(row)
		if err != nil {
			return nil, err
		}
		out = append(out, cand)
	}
	return out, nil
}

// ─── transfer.AuditLogWriter ─────────────────────────────────────────────────

// InsertAuditLog writes a durable event (e.g. receive discrepancy) into
// aud.audit_logs inside the caller's transaction.
func (r *TransferLookup) InsertAuditLog(ctx context.Context, userID int64, action, entity string, entityID int64, newValue []byte, ipAddress *netip.Addr) error {
	err := r.querier(ctx).InsertAuditLog(ctx, InsertAuditLogParams{
		UserID:    pgtype.Int8{Int64: userID, Valid: true},
		Action:    action,
		Entity:    entity,
		EntityID:  pgtype.Int8{Int64: entityID, Valid: true},
		NewValue:  newValue,
		IpAddress: ipAddress,
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to insert audit log: %w", err)
	}
	return nil
}

// transferCandidateFromRow assembles a transfer.Candidate from the shared
// FEFO candidate row, computing qty_free = qty_onhand - qty_reserved.
func transferCandidateFromRow(row ListAllocationCandidatesRow) (*transfer.Candidate, error) {
	onF, err := row.QtyOnhand.Float64Value()
	if err != nil {
		return nil, fmt.Errorf("postgres: bad qty_onhand for balance %d: %w", row.BalanceID, err)
	}
	resF, err := row.QtyReserved.Float64Value()
	if err != nil {
		return nil, fmt.Errorf("postgres: bad qty_reserved for balance %d: %w", row.BalanceID, err)
	}
	cand := &transfer.Candidate{
		BalanceID:  row.BalanceID,
		ItemID:     row.ItemID,
		LocationID: row.LocationID,
		QtyFree:    onF.Float64 - resF.Float64,
	}
	if row.BatchID.Valid {
		v := row.BatchID.Int64
		cand.BatchID = &v
	}
	return cand, nil
}

// CountingLookup implements the counting usecase's master-data and stock
// lookups (warehouses, items, snapshot balances, ledger unit costs).
type CountingLookup struct {
	queries *Queries
}

// NewCountingLookup wires the counting lookups on the sqlc Queries.
func NewCountingLookup(q *Queries) *CountingLookup {
	return &CountingLookup{queries: q}
}

func (r *CountingLookup) querier(ctx context.Context) *Queries {
	if tx := GetTx(ctx); tx != nil {
		return r.queries.WithTx(tx)
	}
	return r.queries
}

// ─── counting.WarehouseLookup ────────────────────────────────────────────────

func (r *CountingLookup) GetWarehouseByID(ctx context.Context, id int64) (*counting.WarehouseInfo, error) {
	row, err := r.querier(ctx).GetWarehouseByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &counting.WarehouseInfo{
		ID:       row.ID,
		Code:     row.Code,
		IsActive: row.IsActive,
	}, nil
}

// ─── counting.ItemLookup ─────────────────────────────────────────────────────

func (r *CountingLookup) GetItemByID(ctx context.Context, id int64) (*counting.ItemInfo, error) {
	row, err := r.querier(ctx).GetItemByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &counting.ItemInfo{
		ID:       row.ID,
		SKU:      row.Sku,
		BaseUom:  row.BaseUom,
		IsActive: row.IsActive,
	}, nil
}

// ─── counting.CountBalanceLookup ─────────────────────────────────────────────

func (r *CountingLookup) ListSnapshotBalances(ctx context.Context, warehouseID int64, zone string, itemID int64) ([]*counting.BalanceSnapshot, error) {
	rows, err := r.querier(ctx).ListCountSnapshotBalances(ctx, ListCountSnapshotBalancesParams{
		WarehouseID: warehouseID,
		Column2:     zone,
		Column3:     itemID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]*counting.BalanceSnapshot, 0, len(rows))
	for _, row := range rows {
		qty, err := row.QtyOnhand.Float64Value()
		if err != nil {
			return nil, fmt.Errorf("postgres: bad qty_onhand for snapshot: %w", err)
		}
		snap := &counting.BalanceSnapshot{
			ItemID:     row.ItemID,
			LocationID: row.LocationID,
			QtyOnhand:  qty.Float64,
		}
		if row.BatchID.Valid {
			v := row.BatchID.Int64
			snap.BatchID = &v
		}
		out = append(out, snap)
	}
	return out, nil
}

// ─── counting.ValueLookup ────────────────────────────────────────────────────

func (r *CountingLookup) LastUnitCost(ctx context.Context, itemID int64) (float64, error) {
	row, err := r.querier(ctx).GetLastUnitCostByItem(ctx, itemID)
	if err != nil {
		return 0, err
	}
	f, err := row.Float64Value()
	if err != nil {
		return 0, fmt.Errorf("postgres: bad unit_cost for item %d: %w", itemID, err)
	}
	return f.Float64, nil
}
