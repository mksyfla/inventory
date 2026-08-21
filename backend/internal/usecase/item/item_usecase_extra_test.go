package item

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"inventory/internal/repository/postgres"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// extraQuerier covers the remaining Querier surface used by the usecase
// (update, list/get, warehouse, category, partner list). Unused Querier
// methods stay nil-embedded; only the ones exercised are overridden.
type extraQuerier struct {
	postgres.Querier

	item       postgres.MasterItems
	itemErr    error
	uoms       []postgres.MasterItemUoms
	uomsErr    error
	items      []postgres.ListItemsRow
	itemsErr   error
	locations  []postgres.MasterLocations
	locErr     error
	partners   []postgres.MasterPartners
	partnerErr error
	cat        postgres.MasterCategories
	catErr     error
	wh         postgres.MasterWarehouses
	whErr      error

	createItemRow    postgres.CreateItemRow
	createItemErr    error
	createItemUoMErr error

	updateItemRow postgres.UpdateItemRow
	updateItemErr error

	categoryCalled  bool
	warehouseCalled bool
}

func (m *extraQuerier) CreateItem(ctx context.Context, arg postgres.CreateItemParams) (postgres.CreateItemRow, error) {
	return m.createItemRow, m.createItemErr
}
func (m *extraQuerier) CreateItemUoM(ctx context.Context, arg postgres.CreateItemUoMParams) (postgres.MasterItemUoms, error) {
	if m.createItemUoMErr != nil {
		return postgres.MasterItemUoms{}, m.createItemUoMErr
	}
	return postgres.MasterItemUoms{ID: 1, ItemID: arg.ItemID, Uom: arg.Uom}, nil
}
func (m *extraQuerier) UpdateItem(ctx context.Context, arg postgres.UpdateItemParams) (postgres.UpdateItemRow, error) {
	if m.updateItemErr != nil {
		return postgres.UpdateItemRow{}, m.updateItemErr
	}
	return m.updateItemRow, nil
}
func (m *extraQuerier) GetItemByID(ctx context.Context, id int64) (postgres.MasterItems, error) {
	if m.itemErr != nil {
		return postgres.MasterItems{}, m.itemErr
	}
	return m.item, nil
}
func (m *extraQuerier) ListItemUoMs(ctx context.Context, itemID int64) ([]postgres.MasterItemUoms, error) {
	return m.uoms, m.uomsErr
}
func (m *extraQuerier) ListItems(ctx context.Context) ([]postgres.ListItemsRow, error) {
	return m.items, m.itemsErr
}
func (m *extraQuerier) ListLocations(ctx context.Context, warehouseID int64) ([]postgres.MasterLocations, error) {
	return m.locations, m.locErr
}
func (m *extraQuerier) ListPartners(ctx context.Context) ([]postgres.MasterPartners, error) {
	return m.partners, m.partnerErr
}
func (m *extraQuerier) CreateCategory(ctx context.Context, arg postgres.CreateCategoryParams) (postgres.MasterCategories, error) {
	m.categoryCalled = true
	return m.cat, m.catErr
}
func (m *extraQuerier) GetWarehouseByCode(ctx context.Context, code string) (postgres.MasterWarehouses, error) {
	return m.wh, m.whErr
}
func (m *extraQuerier) CreateWarehouse(ctx context.Context, arg postgres.CreateWarehouseParams) (postgres.MasterWarehouses, error) {
	m.warehouseCalled = true
	return m.wh, m.whErr
}

func num(t *testing.T, v float64) pgtype.Numeric {
	t.Helper()
	var n pgtype.Numeric
	require.NoError(t, n.Scan(fmt.Sprintf("%f", v)))
	return n
}

// ─── UpdateItem ────────────────────────────────────────────────────────────────

func TestUpdateItem_Success(t *testing.T) {
	mock := &extraQuerier{updateItemRow: postgres.UpdateItemRow{ID: 7, Name: "Baru"}}
	uc := NewUsecase(mock)

	row, err := uc.UpdateItem(context.Background(), UpdateItemInput{
		ID: 7, Name: "Baru", BaseUom: "PCS", IsActive: true, UpdatedBy: 2,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(7), row.ID)
	assert.Equal(t, "Baru", row.Name)
}

func TestUpdateItem_ValidationError(t *testing.T) {
	mock := &extraQuerier{}
	uc := NewUsecase(mock)

	// is_expiry true tapi is_batch false → ditolak (chk_expiry_needs_batch)
	_, err := uc.UpdateItem(context.Background(), UpdateItemInput{
		ID: 7, BaseUom: "PCS", IsExpiry: true, IsBatch: false, UpdatedBy: 2,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "expiry tracking requires batch tracking")
}

func TestUpdateItem_RepoError(t *testing.T) {
	mock := &extraQuerier{updateItemErr: errors.New("db down")}
	uc := NewUsecase(mock)
	_, err := uc.UpdateItem(context.Background(), UpdateItemInput{
		ID: 7, BaseUom: "PCS", UpdatedBy: 2,
	})
	require.Error(t, err)
}

// ─── Location ──────────────────────────────────────────────────────────────────

func TestCreateLocation_EmptyCodeRejected(t *testing.T) {
	uc := NewUsecase(&extraQuerier{})
	_, err := uc.CreateLocation(context.Background(), CreateLocationInput{WarehouseID: 1, LocType: "bulk"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Location code must not be empty")
}

func TestListLocations(t *testing.T) {
	mock := &extraQuerier{locations: []postgres.MasterLocations{
		{ID: 1, WarehouseID: 1, Code: "A-01", LocType: "pick"},
		{ID: 2, WarehouseID: 1, Code: "A-02", LocType: "bulk"},
	}}
	uc := NewUsecase(mock)
	locs, err := uc.ListLocations(context.Background(), 1)
	require.NoError(t, err)
	assert.Len(t, locs, 2)
}

func TestListLocations_Error(t *testing.T) {
	mock := &extraQuerier{locErr: errors.New("query failed")}
	uc := NewUsecase(mock)
	_, err := uc.ListLocations(context.Background(), 1)
	require.Error(t, err)
}

// ─── GetItem / ListItems ───────────────────────────────────────────────────────

func TestGetItem_Success(t *testing.T) {
	mock := &extraQuerier{
		item: postgres.MasterItems{ID: 3, Sku: "SKU-X", Name: "X", BaseUom: "PCS"},
		uoms: []postgres.MasterItemUoms{{ID: 1, ItemID: 3, Uom: "BOX", ConvFactor: num(t, 12)}},
	}
	uc := NewUsecase(mock)
	item, uoms, err := uc.GetItem(context.Background(), 3)
	require.NoError(t, err)
	assert.Equal(t, "SKU-X", item.Sku)
	require.Len(t, uoms, 1)
	assert.Equal(t, "BOX", uoms[0].Uom)
}

func TestGetItem_ItemError(t *testing.T) {
	mock := &extraQuerier{itemErr: errors.New("not found")}
	uc := NewUsecase(mock)
	_, _, err := uc.GetItem(context.Background(), 99)
	require.Error(t, err)
}

func TestGetItem_UoMError(t *testing.T) {
	mock := &extraQuerier{
		item:    postgres.MasterItems{ID: 3, Sku: "SKU-X", BaseUom: "PCS"},
		uomsErr: errors.New("uom query failed"),
	}
	uc := NewUsecase(mock)
	_, _, err := uc.GetItem(context.Background(), 3)
	require.Error(t, err)
}

func TestListItems(t *testing.T) {
	mock := &extraQuerier{items: []postgres.ListItemsRow{
		{ID: 1, Sku: "SKU-1", Name: "Satu", BaseUom: "PCS"},
		{ID: 2, Sku: "SKU-2", Name: "Dua", BaseUom: "BOX"},
	}}
	uc := NewUsecase(mock)
	items, err := uc.ListItems(context.Background())
	require.NoError(t, err)
	assert.Len(t, items, 2)
}

func TestListItems_Error(t *testing.T) {
	mock := &extraQuerier{itemsErr: errors.New("db down")}
	uc := NewUsecase(mock)
	_, err := uc.ListItems(context.Background())
	require.Error(t, err)
}

// ─── Partner (PDP decrypt) ─────────────────────────────────────────────────────

func TestGetPartner_DecryptFailureRedacts(t *testing.T) {
	// Data yang tidak terenkripsi dengan benar → ditandai redacted, bukan
	// ciphertext mentah yang bocor ke klien (M-11).
	mq := &MockQuerier{partnersMap: map[int64]postgres.MasterPartners{
		5: {ID: 5, Code: "P-5", ContactName: pgtype.Text{String: "not-encrypted", Valid: true}},
	}}
	uc := NewUsecase(mq)
	p, err := uc.GetPartner(context.Background(), 5)
	require.NoError(t, err)
	assert.Equal(t, redactedValue, p.ContactName.String)
}

// ─── Category / Warehouse ──────────────────────────────────────────────────────

func TestCreateCategory(t *testing.T) {
	mock := &extraQuerier{cat: postgres.MasterCategories{ID: 9, Code: "CAT-1", Name: "Kategori", IsActive: true}}
	uc := NewUsecase(mock)
	cat, err := uc.CreateCategory(context.Background(), "CAT-1", "Kategori")
	require.NoError(t, err)
	assert.True(t, mock.categoryCalled)
	assert.Equal(t, "CAT-1", cat.Code)
}

func TestGetWarehouse(t *testing.T) {
	mock := &extraQuerier{wh: postgres.MasterWarehouses{ID: 2, Code: "WH01", Name: "Gudang 1", IsActive: true}}
	uc := NewUsecase(mock)
	wh, err := uc.GetWarehouse(context.Background(), "WH01")
	require.NoError(t, err)
	assert.Equal(t, "WH01", wh.Code)
}

func TestGetWarehouse_Error(t *testing.T) {
	mock := &extraQuerier{whErr: errors.New("not found")}
	uc := NewUsecase(mock)
	_, err := uc.GetWarehouse(context.Background(), "WH99")
	require.Error(t, err)
}

func TestCreateWarehouse(t *testing.T) {
	mock := &extraQuerier{wh: postgres.MasterWarehouses{ID: 3, Code: "WH02", Name: "Gudang 2", IsActive: true}}
	uc := NewUsecase(mock)
	wh, err := uc.CreateWarehouse(context.Background(), "WH02", "Gudang 2", "Jl. Merdeka")
	require.NoError(t, err)
	assert.True(t, mock.warehouseCalled)
	assert.Equal(t, "WH02", wh.Code)
}

// ─── CreateItem error paths ────────────────────────────────────────────────────

func TestCreateItem_RepoError(t *testing.T) {
	mock := &extraQuerier{createItemErr: errors.New("duplicate sku")}
	uc := NewUsecase(mock)
	_, err := uc.CreateItem(context.Background(), CreateItemInput{
		Sku: "SKU-DUP", Name: "Dup", BaseUom: "PCS", CreatedBy: 1,
	})
	require.Error(t, err)
}

func TestCreateItem_UoMErrorPropagates(t *testing.T) {
	mock := &extraQuerier{
		createItemRow:    postgres.CreateItemRow{ID: 5, Sku: "SKU-U", BaseUom: "PCS"},
		createItemUoMErr: errors.New("conv factor invalid"),
	}
	uc := NewUsecase(mock)
	_, err := uc.CreateItem(context.Background(), CreateItemInput{
		Sku: "SKU-U", Name: "U", BaseUom: "PCS",
		UoMs:      []ItemUoMInput{{Uom: "BOX", ConvFactor: 12}},
		CreatedBy: 1,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to create item uom")
}
