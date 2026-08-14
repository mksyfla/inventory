package postgres

import (
	"context"
	"fmt"
	"time"

	"inventory/internal/usecase/inbound"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// errNotFound is the sentinel for "lookup has no row" surfaced by lookups
// that cannot use pgx.ErrNoRows directly (e.g. scanning a slice for a UoM).
var errNotFound = pgx.ErrNoRows

// locationInfo assembles an inbound.LocationInfo from raw row values.
func locationInfo(id, warehouseID int64, code string, zone, rack, level pgtype.Text, locType string, pickSeq pgtype.Int4, capacity pgtype.Numeric) *inbound.LocationInfo {
	info := &inbound.LocationInfo{
		ID:          id,
		WarehouseID: warehouseID,
		Code:        code,
		Zone:        zone.String,
		Rack:        rack.String,
		Level:       level.String,
		LocType:     locType,
	}
	if pickSeq.Valid {
		v := int(pickSeq.Int32)
		info.PickSeq = &v
	}
	if capacity.Valid {
		f, err := capacity.Float64Value()
		if err == nil {
			v := f.Float64
			info.Capacity = &v
		}
	}
	return info
}

// dateParam converts a *time.Time into a pgtype.Date parameter.
func dateParam(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: *t, Valid: true}
}

// datePtr converts a pgtype.Date result into a *time.Time.
func datePtr(d pgtype.Date) *time.Time {
	if !d.Valid {
		return nil
	}
	t := d.Time
	return &t
}

// InboundLookup implements the inbound package's master-data lookups
// (items, warehouses, locations, batches) against the sqlc queries.
// Every method honors an active transaction in ctx (GetTx) so the receipt
// usecase can resolve batches inside its own transaction.
type InboundLookup struct {
	queries *Queries
}

// NewInboundLookup wires the lookups on the sqlc Queries.
func NewInboundLookup(q *Queries) *InboundLookup {
	return &InboundLookup{queries: q}
}

func (r *InboundLookup) querier(ctx context.Context) *Queries {
	if tx := GetTx(ctx); tx != nil {
		return r.queries.WithTx(tx)
	}
	return r.queries
}

func (r *InboundLookup) GetItemByID(ctx context.Context, id int64) (*inbound.ItemInfo, error) {
	row, err := r.querier(ctx).GetItemByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &inbound.ItemInfo{
		ID:       row.ID,
		SKU:      row.Sku,
		BaseUom:  row.BaseUom,
		IsBatch:  row.IsBatch,
		IsExpiry: row.IsExpiry,
		IsActive: row.IsActive,
		ABCClass: row.AbcClass.String,
	}, nil
}

func (r *InboundLookup) UomConvFactor(ctx context.Context, itemID int64, uom string) (float64, error) {
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

func (r *InboundLookup) GetWarehouseByID(ctx context.Context, id int64) (*inbound.WarehouseInfo, error) {
	row, err := r.querier(ctx).GetWarehouseByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &inbound.WarehouseInfo{
		ID:       row.ID,
		Code:     row.Code,
		IsActive: row.IsActive,
	}, nil
}

func (r *InboundLookup) GetStaging(ctx context.Context, warehouseID int64) (*inbound.LocationInfo, error) {
	row, err := r.querier(ctx).GetStagingLocation(ctx, warehouseID)
	if err != nil {
		return nil, err
	}
	return locationInfo(row.ID, row.WarehouseID, row.Code, row.Zone, row.Rack, row.Level,
		fmt.Sprint(row.LocType), row.PickSeq, row.Capacity), nil
}

func (r *InboundLookup) GetByWarehouseCode(ctx context.Context, warehouseID int64, code string) (*inbound.LocationInfo, error) {
	row, err := r.querier(ctx).GetLocationByWarehouseCode(ctx, GetLocationByWarehouseCodeParams{
		WarehouseID: warehouseID,
		Code:        code,
	})
	if err != nil {
		return nil, err
	}
	return locationInfo(row.ID, row.WarehouseID, row.Code, row.Zone, row.Rack, row.Level,
		fmt.Sprint(row.LocType), row.PickSeq, row.Capacity), nil
}

func (r *InboundLookup) PutawayCandidates(ctx context.Context, warehouseID int64) ([]*inbound.PutawayCandidate, error) {
	rows, err := r.querier(ctx).ListPutawayCandidates(ctx, warehouseID)
	if err != nil {
		return nil, err
	}
	out := make([]*inbound.PutawayCandidate, 0, len(rows))
	for _, row := range rows {
		used, err := row.UsedQty.Float64Value()
		if err != nil {
			return nil, fmt.Errorf("postgres: bad used_qty: %w", err)
		}
		out = append(out, &inbound.PutawayCandidate{
			Location: *locationInfo(row.ID, row.WarehouseID, row.Code, row.Zone, row.Rack, row.Level,
				fmt.Sprint(row.LocType), row.PickSeq, row.Capacity),
			UsedQty: used.Float64,
		})
	}
	return out, nil
}

func (r *InboundLookup) GetByItemAndNo(ctx context.Context, itemID int64, batchNo string) (*inbound.BatchInfo, error) {
	row, err := r.querier(ctx).GetBatchByItemAndNo(ctx, GetBatchByItemAndNoParams{
		ItemID:  itemID,
		BatchNo: batchNo,
	})
	if err != nil {
		return nil, err
	}
	return &inbound.BatchInfo{
		ID:         row.ID,
		ItemID:     row.ItemID,
		BatchNo:    row.BatchNo,
		ExpiryDate: datePtr(row.ExpiryDate),
	}, nil
}

func (r *InboundLookup) Create(ctx context.Context, itemID int64, batchNo string, expiryDate *time.Time) (*inbound.BatchInfo, error) {
	row, err := r.querier(ctx).CreateBatch(ctx, CreateBatchParams{
		ItemID:     itemID,
		BatchNo:    batchNo,
		MfgDate:    pgtype.Date{},
		ExpiryDate: dateParam(expiryDate),
	})
	if err != nil {
		return nil, err
	}
	return &inbound.BatchInfo{
		ID:         row.ID,
		ItemID:     row.ItemID,
		BatchNo:    row.BatchNo,
		ExpiryDate: datePtr(row.ExpiryDate),
	}, nil
}
