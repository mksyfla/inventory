package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── /healthz (liveness) ──────────────────────────────────────────────────

func TestHealthz_AlwaysOK(t *testing.T) {
	// Liveness never touches dependencies — even with failing checkers it
	// must answer 200.
	router := NewRouter(RouterConfig{
		HealthCheckers: []HealthChecker{
			{Name: "postgres", Check: func(ctx context.Context) error { return errors.New("db down") }},
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "ok", body["status"])
}

// ─── /readyz (readiness) ──────────────────────────────────────────────────

func TestReadyz_AllDependenciesUp(t *testing.T) {
	router := NewRouter(RouterConfig{
		HealthCheckers: []HealthChecker{
			{Name: "postgres", Check: func(ctx context.Context) error { return nil }},
			{Name: "redis", Check: func(ctx context.Context) error { return nil }},
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "ready", body["status"])
	checks := body["checks"].(map[string]any)
	assert.Equal(t, "up", checks["postgres"])
	assert.Equal(t, "up", checks["redis"])
}

func TestReadyz_OneDependencyDown_Returns503(t *testing.T) {
	router := NewRouter(RouterConfig{
		HealthCheckers: []HealthChecker{
			{Name: "postgres", Check: func(ctx context.Context) error { return nil }},
			{Name: "redis", Check: func(ctx context.Context) error { return errors.New("connection refused") }},
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "unavailable", body["status"])
	checks := body["checks"].(map[string]any)
	assert.Equal(t, "up", checks["postgres"])
	assert.Contains(t, checks["redis"].(string), "down")
}

func TestReadyz_NoCheckersConfigured(t *testing.T) {
	// Unit-test default: nothing configured → always ready.
	router := NewRouter()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "ready", body["status"])
}

func TestReadyz_CheckersRunInParallel(t *testing.T) {
	// Both checkers are invoked even though one fails (parallel fan-out).
	seen := map[string]bool{}
	var mu sync.Mutex
	router := NewRouter(RouterConfig{
		HealthCheckers: []HealthChecker{
			{Name: "a", Check: func(ctx context.Context) error { mu.Lock(); seen["a"] = true; mu.Unlock(); return errors.New("boom") }},
			{Name: "b", Check: func(ctx context.Context) error { mu.Lock(); seen["b"] = true; mu.Unlock(); return nil }},
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.True(t, seen["a"])
	assert.True(t, seen["b"])
}
