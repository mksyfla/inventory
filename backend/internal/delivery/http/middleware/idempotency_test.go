package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"inventory/internal/delivery/http/response"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIdempotencyFilter(t *testing.T) {
	e := echo.New()
	e.Use(RequestID(), IdempotencyFilter())
	// Any registers the route for every method so the GET case exercises the
	// middleware itself, not Echo's 405 routing.
	e.Any("/documents", func(c echo.Context) error {
		return c.JSON(http.StatusCreated, map[string]string{"status": "created"})
	})

	run := func(t *testing.T, method, idemKey string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, "/documents", nil)
		if idemKey != "" {
			req.Header.Set("Idempotency-Key", idemKey)
		}
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec
	}

	t.Run("valid UUIDv4 passes through", func(t *testing.T) {
		rec := run(t, http.MethodPost, uuid.New().String())
		assert.Equal(t, http.StatusCreated, rec.Code)
	})

	t.Run("missing key passes through (optional)", func(t *testing.T) {
		rec := run(t, http.MethodPost, "")
		assert.Equal(t, http.StatusCreated, rec.Code)
	})

	t.Run("non-UUID key rejected with 422", func(t *testing.T) {
		rec := run(t, http.MethodPost, "not-a-uuid")
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

		var resp response.Response
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		require.NotNil(t, resp.Error)
		assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
		require.Len(t, resp.Error.Details, 1)
		assert.Equal(t, "Idempotency-Key", resp.Error.Details[0].Field)
	})

	t.Run("UUIDv1 rejected (v4 only)", func(t *testing.T) {
		u, err := uuid.NewUUID()
		require.NoError(t, err)
		rec := run(t, http.MethodPost, u.String())
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})

	t.Run("GET requests are not validated", func(t *testing.T) {
		rec := run(t, http.MethodGet, "garbage-key")
		assert.Equal(t, http.StatusCreated, rec.Code)
	})
}
