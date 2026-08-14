package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/pagination"
	stockuc "inventory/internal/usecase/stock"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockStockRepoForHandler struct {
	stock.StockRepository
	count      int               // number of rows GetMovements returns
	lastFilter stock.MovementFilter // records the filter passed by the handler
}

func (m *mockStockRepoForHandler) GetMovements(ctx context.Context, filter stock.MovementFilter) ([]*stock.StockMovement, error) {
	m.lastFilter = filter
	rows := make([]*stock.StockMovement, 0, m.count)
	for i := 0; i < m.count; i++ {
		rows = append(rows, &stock.StockMovement{
			ID:           int64(100 + i),
			MovedAt:      time.Now(),
			ItemID:       1,
			LocationID:   10,
			Status:       stock.StatusAvailable,
			MovementType: stock.TypeReceipt,
			Qty:          10.0,
			QtyAfter:     float64(10 + i),
			DocNo:        "GRN-1",
		})
	}
	return rows, nil
}

type mockTxRunnerForHandler struct{}

func (r *mockTxRunnerForHandler) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

func TestListMovements_Handler_Success(t *testing.T) {
	repo := &mockStockRepoForHandler{count: 1}
	tx := &mockTxRunnerForHandler{}
	uc := stockuc.NewPostingUsecase(repo, tx)
	h := NewStockHandler(uc)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/stock/movements?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T23:59:59Z&limit=1", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err := h.ListMovements(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)

	dataMap := resp.Data.(map[string]any)
	assert.NotEmpty(t, dataMap["data"])
	assert.NotEmpty(t, dataMap["next_cursor"])
}

// TestListMovements_Handler_FilterPassthrough verifies the handler decodes the
// query params into the keyset filter consumed by the repository (4.4).
func TestListMovements_Handler_FilterPassthrough(t *testing.T) {
	repo := &mockStockRepoForHandler{count: 1}
	tx := &mockTxRunnerForHandler{}
	uc := stockuc.NewPostingUsecase(repo, tx)
	h := NewStockHandler(uc)

	e := echo.New()
	cursor := pagination.EncodeCursor(time.Date(2026, 8, 12, 10, 0, 0, 0, time.UTC), 55)
	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/stock/movements?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T00:00:00Z&item_id=7&limit=33&cursor="+cursor, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	require.NoError(t, h.ListMovements(c))
	assert.Equal(t, http.StatusOK, rec.Code)

	f := repo.lastFilter
	assert.Equal(t, int64(7), f.ItemID)
	assert.Equal(t, 33, f.Limit)
	require.NotNil(t, f.CursorID)
	require.NotNil(t, f.CursorTime)
	assert.Equal(t, int64(55), *f.CursorID)
	assert.Equal(t, time.Date(2026, 8, 12, 10, 0, 0, 0, time.UTC), *f.CursorTime)
	// Defaults are not applied when all params are provided.
	assert.Equal(t, time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), f.StartDate)
}

// TestListMovements_Handler_PartialPageNoCursor verifies next_cursor is empty
// when fewer rows than the page size are returned (end of dataset).
func TestListMovements_Handler_PartialPageNoCursor(t *testing.T) {
	repo := &mockStockRepoForHandler{count: 1}
	tx := &mockTxRunnerForHandler{}
	uc := stockuc.NewPostingUsecase(repo, tx)
	h := NewStockHandler(uc)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/stock/movements?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T00:00:00Z", nil) // default limit 50
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	require.NoError(t, h.ListMovements(c))
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	dataMap := resp.Data.(map[string]any)
	assert.Equal(t, "", dataMap["next_cursor"])
}

// TestListMovements_Handler_FullPageEmitsCursor: when rows == limit, the handler
// must emit a next_cursor so the client can fetch the following page.
func TestListMovements_Handler_FullPageEmitsCursor(t *testing.T) {
	repo := &mockStockRepoForHandler{count: 50}
	tx := &mockTxRunnerForHandler{}
	uc := stockuc.NewPostingUsecase(repo, tx)
	h := NewStockHandler(uc)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/stock/movements?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T00:00:00Z&limit=50", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	require.NoError(t, h.ListMovements(c))
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	dataMap := resp.Data.(map[string]any)
	assert.NotEmpty(t, dataMap["next_cursor"])
	assert.Len(t, dataMap["data"], 50)
}

func TestListMovements_Handler_ValidationError(t *testing.T) {
	repo := &mockStockRepoForHandler{}
	tx := &mockTxRunnerForHandler{}
	uc := stockuc.NewPostingUsecase(repo, tx)
	h := NewStockHandler(uc)

	e := echo.New()
	// Missing start_time & end_time
	req := httptest.NewRequest(http.MethodGet, "/api/v1/stock/movements", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	_ = h.ListMovements(c)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
}

// testListMovementsValidation is a helper: run one request, expect 422.
func testListMovementsValidation(t *testing.T, query string) response.Response {
	t.Helper()
	repo := &mockStockRepoForHandler{}
	tx := &mockTxRunnerForHandler{}
	uc := stockuc.NewPostingUsecase(repo, tx)
	h := NewStockHandler(uc)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/stock/movements"+query, nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	_ = h.ListMovements(c)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code, "query %q must be rejected", query)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
	require.Len(t, resp.Error.Details, 1, "validation error must carry one detail")
	return resp
}

func TestListMovements_Handler_InvalidStartTime(t *testing.T) {
	resp := testListMovementsValidation(t, "?start_time=not-a-date&end_time=2026-08-13T00:00:00Z")
	assert.Equal(t, "start_time", resp.Error.Details[0].Field)
}

func TestListMovements_Handler_InvalidEndTime(t *testing.T) {
	resp := testListMovementsValidation(t, "?start_time=2026-08-01T00:00:00Z&end_time=garbage")
	assert.Equal(t, "end_time", resp.Error.Details[0].Field)
}

func TestListMovements_Handler_EndBeforeStart(t *testing.T) {
	resp := testListMovementsValidation(t, "?start_time=2026-08-10T00:00:00Z&end_time=2026-08-01T00:00:00Z")
	assert.Equal(t, "end_time", resp.Error.Details[0].Field)
}

func TestListMovements_Handler_InvalidItemID(t *testing.T) {
	resp := testListMovementsValidation(t,
		"?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T00:00:00Z&item_id=abc")
	assert.Equal(t, "item_id", resp.Error.Details[0].Field)
}

func TestListMovements_Handler_NonPositiveItemID(t *testing.T) {
	resp := testListMovementsValidation(t,
		"?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T00:00:00Z&item_id=-3")
	assert.Equal(t, "item_id", resp.Error.Details[0].Field)
}

func TestListMovements_Handler_LimitOutOfRange(t *testing.T) {
	resp := testListMovementsValidation(t,
		"?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T00:00:00Z&limit=101")
	assert.Equal(t, "limit", resp.Error.Details[0].Field)
}

func TestListMovements_Handler_LimitZero(t *testing.T) {
	resp := testListMovementsValidation(t,
		"?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T00:00:00Z&limit=0")
	assert.Equal(t, "limit", resp.Error.Details[0].Field)
}

func TestListMovements_Handler_InvalidCursor(t *testing.T) {
	// "-" is not part of the standard base64 alphabet, so this decodes to an error.
	resp := testListMovementsValidation(t,
		"?start_time=2026-08-01T00:00:00Z&end_time=2026-08-13T00:00:00Z&cursor=not-a-valid-cursor")
	assert.Equal(t, "cursor", resp.Error.Details[0].Field)
}
