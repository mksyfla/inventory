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
}

func TestNewRouter_SwaggerUI(t *testing.T) {
	router := NewRouter()
	req := httptest.NewRequest(http.MethodGet, "/swagger/", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), "swagger")
}
