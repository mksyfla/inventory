package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/validation"
	"inventory/internal/repository/postgres"
	itemuc "inventory/internal/usecase/item"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Shared mock querier ─────────────────────────────────────────────────────

type itemMock struct {
	postgres.Querier
	items    map[int64]postgres.MasterItems
	partners map[int64]postgres.MasterPartners
}

func (m *itemMock) CreateItem(ctx context.Context, arg postgres.CreateItemParams) (postgres.CreateItemRow, error) {
	row := postgres.CreateItemRow{ID: 1, Sku: arg.Sku, Name: arg.Name, BaseUom: arg.BaseUom, IsBatch: arg.IsBatch, IsExpiry: arg.IsExpiry}
	m.items[1] = postgres.MasterItems{ID: 1, Sku: arg.Sku, Name: arg.Name, IsActive: true}
	return row, nil
}

func (m *itemMock) CreateItemUoM(ctx context.Context, arg postgres.CreateItemUoMParams) (postgres.MasterItemUoms, error) {
	return postgres.MasterItemUoms{}, nil
}

func (m *itemMock) GetItemByID(ctx context.Context, id int64) (postgres.MasterItems, error) {
	item, ok := m.items[id]
	if !ok {
		return postgres.MasterItems{}, pgx.ErrNoRows
	}
	return item, nil
}

func (m *itemMock) ListItemUoMs(ctx context.Context, itemID int64) ([]postgres.MasterItemUoms, error) {
	return []postgres.MasterItemUoms{}, nil
}

func (m *itemMock) ListItems(ctx context.Context) ([]postgres.ListItemsRow, error) {
	var rows []postgres.ListItemsRow
	for _, item := range m.items {
		rows = append(rows, postgres.ListItemsRow{ID: item.ID, Sku: item.Sku, Name: item.Name, IsActive: item.IsActive})
	}
	return rows, nil
}

func (m *itemMock) SoftDeleteItem(ctx context.Context, arg postgres.SoftDeleteItemParams) (postgres.SoftDeleteItemRow, error) {
	return postgres.SoftDeleteItemRow{ID: arg.ID, IsActive: false}, nil
}

func (m *itemMock) CreateLocation(ctx context.Context, arg postgres.CreateLocationParams) (postgres.MasterLocations, error) {
	return postgres.MasterLocations{ID: 1, WarehouseID: arg.WarehouseID, Code: arg.Code, Zone: arg.Zone, IsActive: true}, nil
}

func (m *itemMock) ListLocations(ctx context.Context, warehouseID int64) ([]postgres.MasterLocations, error) {
	return []postgres.MasterLocations{{ID: 1, WarehouseID: warehouseID, Code: "A-01", IsActive: true}}, nil
}

func (m *itemMock) CreatePartner(ctx context.Context, arg postgres.CreatePartnerParams) (postgres.MasterPartners, error) {
	p := postgres.MasterPartners{ID: 1, Code: arg.Code, PartnerType: arg.PartnerType, Name: arg.Name, ContactName: arg.ContactName, ContactPhone: arg.ContactPhone, IsActive: true}
	m.partners[1] = p
	return p, nil
}

func (m *itemMock) GetPartnerByID(ctx context.Context, id int64) (postgres.MasterPartners, error) {
	p, ok := m.partners[id]
	if !ok {
		return postgres.MasterPartners{}, pgx.ErrNoRows
	}
	return p, nil
}

func (m *itemMock) ListPartners(ctx context.Context) ([]postgres.MasterPartners, error) {
	var result []postgres.MasterPartners
	for _, p := range m.partners {
		result = append(result, p)
	}
	return result, nil
}

func (m *itemMock) ListCategories(ctx context.Context) ([]postgres.MasterCategories, error) {
	return []postgres.MasterCategories{
		{ID: 31, Code: "CAT-RAW", Name: "Bahan Baku", IsActive: true},
		{ID: 36, Code: "CAT-PHA", Name: "Farmasi", IsActive: true},
	}, nil
}

func newItemHandler() (*ItemHandler, *echo.Echo, *itemuc.Usecase) {
	mock := &itemMock{
		items:    make(map[int64]postgres.MasterItems),
		partners: make(map[int64]postgres.MasterPartners),
	}
	uc := itemuc.NewUsecase(mock)
	h := NewItemHandler(uc, nil) // nil asynq client for unit tests
	e := echo.New()
	// Wire the validator so request validation behaves like production.
	e.Validator = validation.New()
	return h, e, uc
}

// ─── Item Tests ───────────────────────────────────────────────────────────────

func TestCreateItem_Handler_Success(t *testing.T) {
	h, e, _ := newItemHandler()
	body := `{"sku":"SKU-001","name":"Test Item","base_uom":"PCS","is_batch":true,"is_expiry":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/items", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.CreateItem(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}

func TestCreateItem_Handler_ValidationError(t *testing.T) {
	h, e, _ := newItemHandler()
	// is_expiry=true but is_batch=false — should fail validation
	body := `{"sku":"SKU-002","name":"Bad Item","base_uom":"PCS","is_batch":false,"is_expiry":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/items", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.CreateItem(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestGetItem_Handler(t *testing.T) {
	h, e, uc := newItemHandler()

	// Pre-seed an item by calling CreateItem then verify not found on 999
	_, err := uc.ListItems(context.Background())
	assert.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/items/999", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("999")

	_ = h.GetItem(c)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSoftDeleteItem_Handler(t *testing.T) {
	h, e, _ := newItemHandler()
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/items/1", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("1")

	err := h.SoftDeleteItem(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestListItems_Handler(t *testing.T) {
	h, e, _ := newItemHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/items", nil)
	rec := httptest.NewRecorder()

	err := h.ListItems(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

// ─── Import Tests ─────────────────────────────────────────────────────────────

func makeCSVUpload(t *testing.T, csvContent string) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "items.csv")
	require.NoError(t, err)
	_, err = part.Write([]byte(csvContent))
	require.NoError(t, err)
	writer.Close()
	return body, writer.FormDataContentType()
}

func TestImportItems_ValidCSV(t *testing.T) {
	h, e, _ := newItemHandler()
	csvContent := "sku,name,base_uom\nSKU-001,Item A,PCS\nSKU-002,Item B,BOX"
	body, contentType := makeCSVUpload(t, csvContent)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/items/import", body)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()

	err := h.ImportItems(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusAccepted, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}

func TestImportItems_MissingColumn(t *testing.T) {
	h, e, _ := newItemHandler()
	// Missing required "base_uom" column
	csvContent := "sku,name\nSKU-001,Item A"
	body, contentType := makeCSVUpload(t, csvContent)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/items/import", body)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()

	err := h.ImportItems(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.Contains(t, resp.Error.Message, "base_uom")
}

func TestImportItems_NoFile(t *testing.T) {
	h, e, _ := newItemHandler()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/items/import", nil)
	rec := httptest.NewRecorder()

	err := h.ImportItems(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

// ─── Location Tests ───────────────────────────────────────────────────────────

func TestCreateLocation_Handler(t *testing.T) {
	h, e, _ := newItemHandler()
	body := `{"warehouse_id":1,"code":"A-01-01","zone":"Zone A","loc_type":"pick"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/locations", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.CreateLocation(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestListLocations_Handler(t *testing.T) {
	h, e, _ := newItemHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/locations?warehouse_id=1", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.QueryParams().Set("warehouse_id", "1")

	err := h.ListLocations(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestListLocations_MissingWarehouseID(t *testing.T) {
	h, e, _ := newItemHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/locations", nil)
	rec := httptest.NewRecorder()

	err := h.ListLocations(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

// ─── Partner Tests ────────────────────────────────────────────────────────────

func TestCreatePartner_Handler(t *testing.T) {
	h, e, _ := newItemHandler()
	body := `{"code":"SUPP-01","partner_type":"supplier","name":"PT Maju Jaya","contact_name":"Budi","contact_phone":"08123456789"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/partners", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.CreatePartner(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}

func TestGetPartner_Handler_NotFound(t *testing.T) {
	h, e, _ := newItemHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/partners/999", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("999")

	err := h.GetPartner(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestListPartners_Handler(t *testing.T) {
	h, e, _ := newItemHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/partners", nil)
	rec := httptest.NewRecorder()

	err := h.ListPartners(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestListCategories_Handler_Success(t *testing.T) {
	h, e, _ := newItemHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/categories", nil)
	rec := httptest.NewRecorder()

	err := h.ListCategories(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	cats, ok := resp.Data.([]any)
	require.True(t, ok)
	assert.Len(t, cats, 2)
}



func TestCreateItem_Handler_EmptySKU(t *testing.T) {
	h, e, _ := newItemHandler()
	body := `{"sku":"","name":"No SKU","base_uom":"PCS"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/items", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.CreateItem(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
	require.NotEmpty(t, resp.Error.Details)
	assert.Equal(t, "sku", resp.Error.Details[0].Field)
}
