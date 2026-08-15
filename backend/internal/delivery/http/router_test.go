package http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/auth"
	redisclient "inventory/internal/pkg/redis"
	countinguc "inventory/internal/usecase/counting"
	outbounduc "inventory/internal/usecase/outbound"
	transferuc "inventory/internal/usecase/transfer"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewRouter_Ping(t *testing.T) {
	router := NewRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ping", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.NoError(t, err)

	assert.True(t, resp.Success)
	assert.Equal(t, "pong", resp.Data)
	assert.NotEmpty(t, rec.Header().Get("X-Request-Id")) // verify request_id middleware ran
}

func TestNewRouter_LoginWithLookupUser(t *testing.T) {
	hash, err := auth.HashPassword("correctPassword123!")
	require.NoError(t, err)

	lookup := func(ctx context.Context, username string) (int64, string, []string, []string, error) {
		if username == "alice" {
			return 1, hash, []string{"staff"}, []string{"WH01"}, nil
		}
		return 0, "", nil, nil, fmt.Errorf("user not found")
	}

	router := NewRouter(RouterConfig{
		JWTSecret:  "test-secret",
		Store:      redisclient.NewInMemoryStore(),
		LookupUser: lookup,
		CreateUser: func(ctx context.Context, username, email, fullName, passwordHash string) (int64, error) {
			return 1, nil
		},
	})

	body := `{"username":"alice","password":"correctPassword123!"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	data, ok := resp.Data.(map[string]any)
	require.True(t, ok)
	assert.NotEmpty(t, data["access_token"])
	assert.NotEmpty(t, data["refresh_token"])
}

func TestNewRouter_LoginLookupNotInitialized(t *testing.T) {
	router := NewRouter(RouterConfig{
		JWTSecret: "test-secret",
		Store:     redisclient.NewInMemoryStore(),
	})

	body := `{"username":"alice","password":"whatever123!"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusInternalServerError, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "ERR_INTERNAL", resp.Error.Code)
}

func TestNewRouter_RegisterEndpoint(t *testing.T) {
	created := 0
	router := NewRouter(RouterConfig{
		JWTSecret: "test-secret",
		Store:     redisclient.NewInMemoryStore(),
		CreateUser: func(ctx context.Context, username, email, fullName, passwordHash string) (int64, error) {
			created++
			return 42, nil
		},
	})

	body := `{"username":"bob","email":"bob@example.com","full_name":"Bob","password":"correctPassword123!"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, 1, created)
}

func TestNewRouter_RegisterValidationError(t *testing.T) {
	router := NewRouter(RouterConfig{
		JWTSecret: "test-secret",
		Store:     redisclient.NewInMemoryStore(),
		CreateUser: func(ctx context.Context, username, email, fullName, passwordHash string) (int64, error) {
			return 1, nil
		},
	})

	// 11-char password violates the FSD §6 minimum of 12
	body := `{"username":"bob","email":"bob@example.com","full_name":"Bob","password":"shortpass99"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "ERR_VALIDATION", resp.Error.Code)
	require.NotEmpty(t, resp.Error.Details)
	assert.Equal(t, "password", resp.Error.Details[0].Field)
	assert.Contains(t, resp.Error.Details[0].Message, "12")
}

func TestNewRouter_OpenAPIYAML(t *testing.T) {
	router := NewRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/openapi.yaml", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Header().Get("Content-Type"), "yaml")
	assert.Contains(t, rec.Body.String(), "openapi:")
}

func TestNewRouter_OpenAPIJSON(t *testing.T) {
	router := NewRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/openapi.json", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var doc map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &doc))
	paths, ok := doc["paths"].(map[string]any)
	require.True(t, ok)
	assert.Contains(t, paths, "/items")
	assert.Contains(t, paths, "/stock/movements")
	assert.Contains(t, paths, "/auth/login")
	// Fase 7 outbound endpoints
	assert.Contains(t, paths, "/requests")
	assert.Contains(t, paths, "/requests/{id}/submit")
	assert.Contains(t, paths, "/requests/{id}/approve")
	assert.Contains(t, paths, "/deliveries")
	assert.Contains(t, paths, "/deliveries/{id}/submit")
	assert.Contains(t, paths, "/deliveries/{id}/approve")
	assert.Contains(t, paths, "/deliveries/{id}/allocate")
	assert.Contains(t, paths, "/deliveries/{id}/allocate/override")
	assert.Contains(t, paths, "/deliveries/{id}/picking-list")
	assert.Contains(t, paths, "/deliveries/{id}/pick")
	assert.Contains(t, paths, "/deliveries/{id}/ship")
	assert.Contains(t, paths, "/deliveries/{id}/pod")
	// Fase 8 transfer (M5) endpoints
	assert.Contains(t, paths, "/transfers")
	assert.Contains(t, paths, "/transfers/{id}/submit")
	assert.Contains(t, paths, "/transfers/{id}/approve")
	assert.Contains(t, paths, "/transfers/{id}/send")
	assert.Contains(t, paths, "/transfers/{id}/receive")
	// Fase 8 stock opname (M6) endpoints
	assert.Contains(t, paths, "/counts")
	assert.Contains(t, paths, "/counts/{id}/lines")
	assert.Contains(t, paths, "/counts/{id}/post")
	assert.Contains(t, paths, "/adjustments")
}

func TestNewRouter_SwaggerUI(t *testing.T) {
	router := NewRouter()
	req := httptest.NewRequest(http.MethodGet, "/swagger/", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), "swagger")
}

// TestNewRouter_Fase78RoutesRegistered proves every Fase 7 (outbound) and
// Fase 8 (transfer + counting) route is wired into the Echo router: a
// registered route answers 401 Unauthorized (JWT-protected), a missing one
// would answer 404.
func TestNewRouter_Fase78RoutesRegistered(t *testing.T) {
	router := NewRouter(RouterConfig{
		JWTSecret:       "test-secret",
		Store:           redisclient.NewInMemoryStore(),
		OutboundUsecase: &outbounduc.OutboundUsecase{},
		TransferUsecase: &transferuc.TransferUsecase{},
		CountingUsecase: &countinguc.CountingUsecase{},
	})

	routes := []struct{ method, path string }{
		{"POST", "/api/v1/requests"},
		{"POST", "/api/v1/requests/1/submit"},
		{"POST", "/api/v1/requests/1/approve"},
		{"POST", "/api/v1/deliveries"},
		{"POST", "/api/v1/deliveries/1/submit"},
		{"POST", "/api/v1/deliveries/1/approve"},
		{"POST", "/api/v1/deliveries/1/allocate"},
		{"POST", "/api/v1/deliveries/1/allocate/override"},
		{"GET", "/api/v1/deliveries/1/picking-list"},
		{"POST", "/api/v1/deliveries/1/pick"},
		{"POST", "/api/v1/deliveries/1/ship"},
		{"POST", "/api/v1/deliveries/1/pod"},
		{"POST", "/api/v1/transfers"},
		{"POST", "/api/v1/transfers/1/submit"},
		{"POST", "/api/v1/transfers/1/approve"},
		{"POST", "/api/v1/transfers/1/send"},
		{"POST", "/api/v1/transfers/1/receive"},
		{"POST", "/api/v1/counts"},
		{"POST", "/api/v1/counts/1/lines"},
		{"POST", "/api/v1/counts/1/post"},
		{"POST", "/api/v1/adjustments"},
	}
	for _, rt := range routes {
		t.Run(rt.method+" "+rt.path, func(t *testing.T) {
			req := httptest.NewRequest(rt.method, rt.path, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusUnauthorized, rec.Code,
				"route must be registered and JWT-protected (401), not %d", rec.Code)
		})
	}
}
