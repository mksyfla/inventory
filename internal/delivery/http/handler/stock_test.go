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
	stockuc "inventory/internal/usecase/stock"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockStockRepoForHandler struct {
	stock.StockRepository
}

func (m *mockStockRepoForHandler) GetMovements(ctx context.Context, filter stock.MovementFilter) ([]*stock.StockMovement, error) {
	return []*stock.StockMovement{
		{
			ID:           100,
			MovedAt:      time.Now(),
			ItemID:       1,
			LocationID:   10,
			Status:       stock.StatusAvailable,
			MovementType: stock.TypeReceipt,
			Qty:          10.0,
			QtyAfter:     10.0,
			DocNo:        "GRN-1",
		},
	}, nil
}

type mockTxRunnerForHandler struct{}

func (r *mockTxRunnerForHandler) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

func TestListMovements_Handler_Success(t *testing.T) {
	repo := &mockStockRepoForHandler{}
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
