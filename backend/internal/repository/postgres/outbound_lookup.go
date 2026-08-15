package postgres

import (
	"context"
	"fmt"

	"inventory/internal/usecase/outbound"

	"github.com/jackc/pgx/v5/pgtype"
)

// OutboundLookup implements the outbound usecase's master-data and stock
// lookups (items, barcodes, warehouses, locations, allocation candidates).
// Every method honors an active transaction in ctx (GetTx) so the outbound
// usecase can lock allocation candidates and reserve balances inside its own
// transaction.
type OutboundLookup struct {
	queries *Queries
}

// NewOutboundLookup wires the lookups on the sqlc Queries.
func NewOutboundLookup(q *Queries) *OutboundLookup {
	return &OutboundLookup{queries: q}
}

func (r *OutboundLookup) querier(ctx context.Context) *Queries {
	if tx := GetTx(ctx); tx != nil {
		return r.queries.WithTx(tx)
	}
	return r.queries
}

// ─── outbound.ItemLookup ─────────────────────────────────────────────────────

func (r *OutboundLookup) GetItemByID(ctx context.Context, id int64) (*outbound.ItemInfo, error) {
	row, err := r.querier(ctx).GetItemByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &outbound.ItemInfo{
		ID:       row.ID,
		SKU:      row.Sku,
		BaseUom:  row.BaseUom,
		IsBatch:  row.IsBatch,
		IsActive: row.IsActive,
	}, nil
}

func (r *OutboundLookup) UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error) {
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

func (r *OutboundLookup) GetItemByBarcode(ctx context.Context, barcode string) (*outbound.BarcodeItem, error) {
	row, err := r.querier(ctx).GetItemByBarcode(ctx, pgtype.Text{String: barcode, Valid: true})
	if err != nil {
		return nil, err
	}
	conv, err := row.ConvFactor.Float64Value()
	if err != nil {
		return nil, fmt.Errorf("postgres: bad conv_factor for barcode %q: %w", barcode, err)
	}
	return &outbound.BarcodeItem{
		ItemID:     row.ItemID,
		SKU:        row.Sku,
		BaseUom:    row.BaseUom,
		Uom:        row.Uom,
		ConvFactor: conv.Float64,
	}, nil
}

// ─── outbound.WarehouseLookup ────────────────────────────────────────────────

func (r *OutboundLookup) GetWarehouseByID(ctx context.Context, id int64) (*outbound.WarehouseInfo, error) {
	row, err := r.querier(ctx).GetWarehouseByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &outbound.WarehouseInfo{
		ID:       row.ID,
		Code:     row.Code,
		IsActive: row.IsActive,
	}, nil
}

// ─── outbound.LocationLookup ─────────────────────────────────────────────────

func (r *OutboundLookup) GetByWarehouseCode(ctx context.Context, warehouseID int64, code string) (*outbound.LocationInfo, error) {
	row, err := r.querier(ctx).GetLocationByWarehouseCode(ctx, GetLocationByWarehouseCodeParams{
		WarehouseID: warehouseID,
		Code:        code,
	})
	if err != nil {
		return nil, err
	}
	return &outbound.LocationInfo{
		ID:          row.ID,
		WarehouseID: row.WarehouseID,
		Code:        row.Code,
		LocType:     fmt.Sprint(row.LocType),
	}, nil
}

// ─── outbound.StockCandidates ────────────────────────────────────────────────

func (r *OutboundLookup) LockAllocationCandidates(ctx context.Context, itemID, warehouseID int64) ([]*outbound.AllocationCandidate, error) {
	rows, err := r.querier(ctx).ListAllocationCandidates(ctx, ListAllocationCandidatesParams{
		ItemID:      itemID,
		WarehouseID: warehouseID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]*outbound.AllocationCandidate, 0, len(rows))
	for _, row := range rows {
		cand, err := candidateFromRow(row.BalanceID, row.ItemID, row.LocationID, row.BatchID,
			row.QtyOnhand, row.QtyReserved, row.LocationCode, row.PickSeq, row.ExpiryDate)
		if err != nil {
			return nil, err
		}
		out = append(out, cand)
	}
	return out, nil
}

func (r *OutboundLookup) GetCandidateByBalanceID(ctx context.Context, balanceID, warehouseID int64) (*outbound.AllocationCandidate, error) {
	row, err := r.querier(ctx).GetAllocationCandidateByBalanceID(ctx, GetAllocationCandidateByBalanceIDParams{
		ID:          balanceID,
		WarehouseID: warehouseID,
	})
	if err != nil {
		return nil, err
	}
	return candidateFromRow(row.BalanceID, row.ItemID, row.LocationID, row.BatchID,
		row.QtyOnhand, row.QtyReserved, row.LocationCode, row.PickSeq, row.ExpiryDate)
}

func (r *OutboundLookup) UpdateBalanceReserved(ctx context.Context, balanceID int64, delta float64) error {
	var d pgtype.Numeric
	_ = d.Scan(fmt.Sprintf("%f", delta))
	err := r.querier(ctx).UpdateBalanceReserved(ctx, UpdateBalanceReservedParams{
		ID:          balanceID,
		QtyReserved: d,
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to reserve balance %d: %w", balanceID, err)
	}
	return nil
}

// candidateFromRow assembles an outbound.AllocationCandidate from raw values,
// computing qty_free = qty_onhand - qty_reserved.
func candidateFromRow(balanceID, itemID, locationID int64, batchID pgtype.Int8,
	onhand, reserved pgtype.Numeric, locationCode string, pickSeq pgtype.Int4,
	expiry pgtype.Date) (*outbound.AllocationCandidate, error) {

	onF, err := onhand.Float64Value()
	if err != nil {
		return nil, fmt.Errorf("postgres: bad qty_onhand for balance %d: %w", balanceID, err)
	}
	resF, err := reserved.Float64Value()
	if err != nil {
		return nil, fmt.Errorf("postgres: bad qty_reserved for balance %d: %w", balanceID, err)
	}
	cand := &outbound.AllocationCandidate{
		BalanceID:    balanceID,
		ItemID:       itemID,
		LocationID:   locationID,
		QtyFree:      onF.Float64 - resF.Float64,
		LocationCode: locationCode,
	}
	if batchID.Valid {
		v := batchID.Int64
		cand.BatchID = &v
	}
	if pickSeq.Valid {
		v := int(pickSeq.Int32)
		cand.PickSeq = &v
	}
	if expiry.Valid {
		t := expiry.Time
		cand.ExpiryDate = &t
	}
	return cand, nil
}
