package middleware

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/logger"
	stockuc "inventory/internal/usecase/stock"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRequestIDMiddleware(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := RequestID()(func(c echo.Context) error {
		// Verify context contains request id
		ctxID := c.Request().Context().Value(logger.RequestIDKey)
		assert.NotEmpty(t, ctxID)
		// Verify Echo context contains request id
		echoID := c.Get("request_id")
		assert.Equal(t, ctxID, echoID)
		return c.String(http.StatusOK, "OK")
	})

	err := handler(c)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	// Verify header contains request id
	respID := rec.Header().Get("X-Request-Id")
	assert.NotEmpty(t, respID)
}

func TestRequestIDMiddleware_PreservesExisting(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Request-Id", "existing-id-xyz")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := RequestID()(func(c echo.Context) error {
		ctxID := c.Request().Context().Value(logger.RequestIDKey)
		assert.Equal(t, "existing-id-xyz", ctxID)
		return c.String(http.StatusOK, "OK")
	})

	err := handler(c)
	assert.NoError(t, err)
	assert.Equal(t, "existing-id-xyz", rec.Header().Get("X-Request-Id"))
}

func TestHTTPErrorHandler_AppError(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set("request_id", "req-123")

	appErr := &apperr.AppError{
		Code:      "ERR_STOCK_INSUFFICIENT",
		Message:   "Insufficient stock",
		RequestID: "req-123",
		Details: []response.ErrorDetail{
			{Field: "qty", Message: "Needs at least 10"},
		},
	}

	HTTPErrorHandler(appErr, c)

	assert.Equal(t, http.StatusConflict, rec.Code) // mapped via mapErrorCodeToStatus

	var resp response.Response
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.NoError(t, err)

	assert.False(t, resp.Success)
	assert.Equal(t, "ERR_STOCK_INSUFFICIENT", resp.Error.Code)
	assert.Equal(t, "Insufficient stock", resp.Error.Message)
	assert.Equal(t, "req-123", resp.Error.RequestID)
	assert.Len(t, resp.Error.Details, 1)
	assert.Equal(t, "qty", resp.Error.Details[0].Field)
}

func TestHTTPErrorHandler_EchoError(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	echoErr := echo.NewHTTPError(http.StatusNotFound, "route not found")

	HTTPErrorHandler(echoErr, c)

	assert.Equal(t, http.StatusNotFound, rec.Code)

	var resp response.Response
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.NoError(t, err)

	assert.False(t, resp.Success)
	assert.Equal(t, "ERR_ROUTE_NOT_FOUND", resp.Error.Code)
	assert.Equal(t, "route not found", resp.Error.Message)
}

func TestHTTPErrorHandler_GenericError(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	genericErr := errors.New("something went very wrong")

	HTTPErrorHandler(genericErr, c)

	assert.Equal(t, http.StatusInternalServerError, rec.Code)

	var resp response.Response
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.NoError(t, err)

	assert.False(t, resp.Success)
	assert.Equal(t, "ERR_INTERNAL_SERVER", resp.Error.Code)
	assert.Equal(t, "Internal server error", resp.Error.Message)
}

func TestHTTPErrorHandler_ValidationError(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	appErr := &apperr.AppError{Code: "ERR_VALIDATION", Message: "Invalid request payload"}
	HTTPErrorHandler(appErr, c)

	// FSD §5.4: ERR_VALIDATION maps to 422
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
}

func TestHTTPErrorHandler_ShortageDetails(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	appErr := &apperr.AppError{
		Code:    "ERR_STOCK_INSUFFICIENT",
		Message: "Stok tersedia tidak mencukupi",
		Details: []stockuc.ShortageDetail{
			{Field: "lines[0].qty", SKU: "SKU-001", Requested: 100, Available: 60},
		},
	}
	HTTPErrorHandler(appErr, c)

	assert.Equal(t, http.StatusConflict, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Error.Details, 1)
	assert.Equal(t, "lines[0].qty", resp.Error.Details[0].Field)
	assert.Equal(t, "SKU-001", resp.Error.Details[0].SKU)
	assert.Equal(t, float64(100), resp.Error.Details[0].Requested)
	assert.Equal(t, float64(60), resp.Error.Details[0].Available)
}
