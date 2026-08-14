package item

import (
	"context"
	"fmt"
	"testing"

	"inventory/internal/repository/postgres"

	"github.com/stretchr/testify/assert"
)

type MockQuerier struct {
	postgres.Querier
	createItemCalled    bool
	createItemUoMCalled bool
	softDeleteCalled    bool
	createPartnerCalled bool
	partnersMap         map[int64]postgres.MasterPartners
}

func (m *MockQuerier) CreateItem(ctx context.Context, arg postgres.CreateItemParams) (postgres.CreateItemRow, error) {
	m.createItemCalled = true
	return postgres.CreateItemRow{
		ID:       100,
		Sku:      arg.Sku,
		Name:     arg.Name,
		BaseUom:  arg.BaseUom,
		IsBatch:  arg.IsBatch,
		IsExpiry: arg.IsExpiry,
	}, nil
}

func (m *MockQuerier) CreateItemUoM(ctx context.Context, arg postgres.CreateItemUoMParams) (postgres.MasterItemUoms, error) {
	m.createItemUoMCalled = true
	return postgres.MasterItemUoms{
		ID:         200,
		ItemID:     arg.ItemID,
		Uom:        arg.Uom,
		ConvFactor: arg.ConvFactor,
	}, nil
}

func (m *MockQuerier) SoftDeleteItem(ctx context.Context, arg postgres.SoftDeleteItemParams) (postgres.SoftDeleteItemRow, error) {
	m.softDeleteCalled = true
	return postgres.SoftDeleteItemRow{
		ID:       arg.ID,
		IsActive: false,
	}, nil
}

func (m *MockQuerier) CreatePartner(ctx context.Context, arg postgres.CreatePartnerParams) (postgres.MasterPartners, error) {
	m.createPartnerCalled = true
	p := postgres.MasterPartners{
		ID:           1,
		Code:         arg.Code,
		PartnerType:  arg.PartnerType,
		Name:         arg.Name,
		Address:      arg.Address,
		ContactName:  arg.ContactName,
		ContactPhone: arg.ContactPhone,
		IsActive:     arg.IsActive,
	}
	m.partnersMap[1] = p
	return p, nil
}

func (m *MockQuerier) GetPartnerByID(ctx context.Context, id int64) (postgres.MasterPartners, error) {
	p, ok := m.partnersMap[id]
	if !ok {
		return postgres.MasterPartners{}, fmt.Errorf("not found")
	}
	return p, nil
}

func (m *MockQuerier) CreateLocation(ctx context.Context, arg postgres.CreateLocationParams) (postgres.MasterLocations, error) {
	return postgres.MasterLocations{
		ID:          1,
		WarehouseID: arg.WarehouseID,
		Code:        arg.Code,
		Zone:        arg.Zone,
		Rack:        arg.Rack,
		Level:       arg.Level,
		LocType:     arg.LocType,
		IsActive:    arg.IsActive,
	}, nil
}

// ─── Tests ───────────────────────────────────────────────────────────────────

func TestCreateItem_Success(t *testing.T) {
	mock := &MockQuerier{}
	uc := NewUsecase(mock)

	in := CreateItemInput{
		Sku:        "SKU-ABC",
		Name:       "Test Item",
		BaseUom:    "PCS",
		IsBatch:    true,
		IsExpiry:   true,
		CategoryID: nil,
		UoMs: []ItemUoMInput{
			{Uom: "BOX", ConvFactor: 12},
		},
		CreatedBy: 1,
	}

	row, err := uc.CreateItem(context.Background(), in)
	assert.NoError(t, err)
	assert.Equal(t, int64(100), row.ID)
	assert.True(t, mock.createItemCalled)
	assert.True(t, mock.createItemUoMCalled)
}

func TestCreateItem_ValidationError(t *testing.T) {
	mock := &MockQuerier{}
	uc := NewUsecase(mock)

	// is_expiry is true, but is_batch is false
	in := CreateItemInput{
		Sku:      "SKU-ABC",
		Name:     "Test Item",
		BaseUom:  "PCS",
		IsBatch:  false,
		IsExpiry: true,
	}

	_, err := uc.CreateItem(context.Background(), in)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "expiry tracking requires batch tracking")
}

func TestSoftDeleteItem(t *testing.T) {
	mock := &MockQuerier{}
	uc := NewUsecase(mock)

	err := uc.SoftDeleteItem(context.Background(), 100, 1)
	assert.NoError(t, err)
	assert.True(t, mock.softDeleteCalled)
}

func TestCreatePartner_Encryption(t *testing.T) {
	mock := &MockQuerier{partnersMap: make(map[int64]postgres.MasterPartners)}
	uc := NewUsecase(mock)

	in := CreatePartnerInput{
		Code:         "PARTNER-01",
		PartnerType:  "supplier",
		Name:         "PT Supplier Abadi",
		Address:      "Jl. Industri No 1",
		ContactName:  "Budi Santoso",
		ContactPhone: "081234567890",
	}

	// Create should encrypt sensitive details and return decrypted for output DTO
	p, err := uc.CreatePartner(context.Background(), in)
	assert.NoError(t, err)
	assert.Equal(t, "Budi Santoso", p.ContactName.String)
	assert.Equal(t, "081234567890", p.ContactPhone.String)

	// Verify that in mock repository (the simulated DB storage), details are encrypted
	saved := mock.partnersMap[1]
	assert.NotEqual(t, "Budi Santoso", saved.ContactName.String)
	assert.NotEqual(t, "081234567890", saved.ContactPhone.String)

	// Fetch partner back — should decrypt correctly
	fetched, err := uc.GetPartner(context.Background(), 1)
	assert.NoError(t, err)
	assert.Equal(t, "Budi Santoso", fetched.ContactName.String)
	assert.Equal(t, "081234567890", fetched.ContactPhone.String)
}

func TestCreateLocation(t *testing.T) {
	mock := &MockQuerier{}
	uc := NewUsecase(mock)

	zone := "Zone A"
	in := CreateLocationInput{
		WarehouseID: 1,
		Code:        "A-01-01",
		Zone:        &zone,
		LocType:     "pick",
	}

	loc, err := uc.CreateLocation(context.Background(), in)
	assert.NoError(t, err)
	assert.Equal(t, "A-01-01", loc.Code)
	assert.Equal(t, "Zone A", loc.Zone.String)
}
