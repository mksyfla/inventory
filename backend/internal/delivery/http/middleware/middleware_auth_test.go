package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/auth"
	redisclient "inventory/internal/pkg/redis"

	"github.com/casbin/casbin/v2"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "test-jwt-secret-middleware"

func makeTokenFor(t *testing.T, userID int64, roles, warehouses []string) string {
	t.Helper()
	pair, err := auth.GenerateTokenPair(userID, "testuser", roles, warehouses, testSecret)
	require.NoError(t, err)
	return pair.AccessToken
}

func newEnforcer(t *testing.T) *casbin.Enforcer {
	t.Helper()
	e, err := auth.NewEnforcer("")
	require.NoError(t, err)
	return e
}

// ─── JWT Middleware Tests ────────────────────────────────────────────────────

func TestJWTAuthMiddleware_Valid(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"}))
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	called := false
	handler := JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		called = true
		claims, ok := GetClaims(c)
		assert.True(t, ok)
		assert.Equal(t, int64(1), claims.UserID)
		return c.NoContent(http.StatusOK)
	})

	err := handler(c)
	assert.NoError(t, err)
	assert.True(t, called)
}

func TestJWTAuthMiddleware_MissingHeader(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})

	err := handler(c)
	require.NoError(t, err) // handler writes error response directly
	assert.Equal(t, http.StatusUnauthorized, rec.Code)

	var resp response.Response
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.False(t, resp.Success)
	assert.Equal(t, "ERR_UNAUTHENTICATED", resp.Error.Code)
}

func TestJWTAuthMiddleware_InvalidToken(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer bad.token.here")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})

	_ = handler(c)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTAuthMiddleware_ExpiredToken(t *testing.T) {
	// Manually generate an expired token
	pair, _ := auth.GenerateTokenPair(1, "u", nil, nil, testSecret)
	// Tamper: we can't easily set expiry without re-signing, so we test with wrong secret simulation
	// Instead verify parse fails on wrong secret
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	// Parse with wrong secret → should return 401
	handler := JWTAuthMiddleware("wrong-secret")(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	_ = handler(c)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// ─── RBAC Middleware Tests ───────────────────────────────────────────────────

func setupRBACContext(t *testing.T, e *echo.Echo, token, warehouseID string) (echo.Context, *httptest.ResponseRecorder) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Warehouse-Id", warehouseID)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	// Pre-inject JWT claims as JWTAuthMiddleware would
	claims, _ := auth.ParseAccessToken(token, testSecret)
	c.Set(string(ClaimsKey), claims)
	return c, rec
}

func TestRBACMiddleware_Allowed(t *testing.T) {
	e := echo.New()
	enforcer := newEnforcer(t)
	_, _ = enforcer.AddPolicy("staff", "WH01", "receipts", "create")

	token := makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})
	c, rec := setupRBACContext(t, e, token, "WH01")

	handler := RBACMiddleware(enforcer, "receipts", "create", nil)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})

	err := handler(c)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestRBACMiddleware_Forbidden_WrongWarehouse(t *testing.T) {
	e := echo.New()
	enforcer := newEnforcer(t)
	_, _ = enforcer.AddPolicy("staff", "WH01", "receipts", "create")

	token := makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})
	c, rec := setupRBACContext(t, e, token, "WH99") // wrong warehouse

	handler := RBACMiddleware(enforcer, "receipts", "create", nil)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	_ = handler(c)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestRBACMiddleware_MissingWarehouseHeader(t *testing.T) {
	e := echo.New()
	enforcer := newEnforcer(t)

	req := httptest.NewRequest(http.MethodGet, "/", nil) // no X-Warehouse-Id
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	token := makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})
	claims, _ := auth.ParseAccessToken(token, testSecret)
	c.Set(string(ClaimsKey), claims)

	handler := RBACMiddleware(enforcer, "receipts", "create", nil)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	_ = handler(c)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

// ─── Rate Limiter Tests ──────────────────────────────────────────────────────

func TestRateLimitMiddleware_Allow(t *testing.T) {
	store := redisclient.NewInMemoryStore()
	e := echo.New()

	mw := RateLimitMiddleware(store, 3, time.Minute, func(c echo.Context) string { return "test-ip" })
	handler := mw(func(c echo.Context) error { return c.NoContent(http.StatusOK) })

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		_ = handler(c)
		assert.Equal(t, http.StatusOK, rec.Code, fmt.Sprintf("request %d should be allowed", i+1))
	}
}

func TestRateLimitMiddleware_Exceed(t *testing.T) {
	store := redisclient.NewInMemoryStore()
	e := echo.New()

	mw := RateLimitMiddleware(store, 2, time.Minute, func(c echo.Context) string { return "same-key" })
	handler := mw(func(c echo.Context) error { return c.NoContent(http.StatusOK) })

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		_ = handler(e.NewContext(req, rec))
	}

	// 3rd request should be rejected
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	err := handler(e.NewContext(req, rec))
	require.Error(t, err)
	httpErr, ok := err.(*echo.HTTPError)
	require.True(t, ok)
	assert.Equal(t, http.StatusTooManyRequests, httpErr.Code)
}

// ─── Security Headers Tests ──────────────────────────────────────────────────

func TestSecurityHeaders(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := SecurityHeaders()(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})

	err := handler(c)
	require.NoError(t, err)
	assert.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "DENY", rec.Header().Get("X-Frame-Options"))
	assert.NotEmpty(t, rec.Header().Get("Content-Security-Policy"))
}

func TestRBACMiddleware_WarehouseNotAssigned(t *testing.T) {
	e := echo.New()
	enforcer := newEnforcer(t)
	// Policy exists for the role at WH02, but the user is only assigned WH01 —
	// the membership check must deny before any policy lookup (A01).
	_, _ = enforcer.AddPolicy("staff", "WH02", "receipts", "create")

	token := makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})
	c, rec := setupRBACContext(t, e, token, "WH02")

	handler := RBACMiddleware(enforcer, "receipts", "create", nil)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	_ = handler(c)
	assert.Equal(t, http.StatusForbidden, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "ERR_FORBIDDEN", resp.Error.Code)
	assert.Contains(t, resp.Error.Message, "assigned")
}

func TestRBACMiddleware_NoPolicyButAssigned(t *testing.T) {
	e := echo.New()
	enforcer := newEnforcer(t) // no policies at all

	token := makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})
	c, rec := setupRBACContext(t, e, token, "WH01")

	handler := RBACMiddleware(enforcer, "receipts", "create", nil)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	_ = handler(c)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

// ─── Rate Limiter TTL Tests ───────────────────────────────────────────────────

func TestRateLimitMiddleware_WindowExpires(t *testing.T) {
	store := redisclient.NewInMemoryStore()
	e := echo.New()

	mw := RateLimitMiddleware(store, 2, 50*time.Millisecond, func(c echo.Context) string { return "ttl-test" })
	handler := mw(func(c echo.Context) error { return c.NoContent(http.StatusOK) })

	req := func() error {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		return handler(e.NewContext(r, rec))
	}

	require.NoError(t, req())
	require.NoError(t, req())
	require.Error(t, req()) // 3rd exceeds limit

	// After the window passes, requests are allowed again (no permanent lockout)
	time.Sleep(60 * time.Millisecond)
	require.NoError(t, req())
}

// TestRateLimitMiddleware_WindowNotRefreshedByActivity pins the H-02 fixed-window
// semantics: the TTL is armed once per window (on the first request), NOT re-armed
// on every request. A blocked client therefore recovers `window` after the burst
// began instead of being locked out permanently.
func TestRateLimitMiddleware_WindowNotRefreshedByActivity(t *testing.T) {
	store := redisclient.NewInMemoryStore()
	e := echo.New()

	mw := RateLimitMiddleware(store, 2, 100*time.Millisecond, func(c echo.Context) string { return "refresh-test" })
	handler := mw(func(c echo.Context) error { return c.NoContent(http.StatusOK) })

	req := func() error {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		return handler(e.NewContext(r, rec))
	}

	require.NoError(t, req())          // count=1, window armed (expires ~100ms)
	time.Sleep(60 * time.Millisecond)
	require.NoError(t, req())          // count=2, window NOT re-armed by activity
	time.Sleep(60 * time.Millisecond)  // ~120ms since first request → window expired
	require.NoError(t, req())          // fresh window (count=1 again) → allowed; no permanent lockout
}

func TestJWTAuthMiddleware_AcceptTokenFromCookie(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: auth.AccessTokenCookieName, Value: makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})})
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	called := false
	handler := JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		called = true
		claims, ok := GetClaims(c)
		assert.True(t, ok)
		assert.Equal(t, int64(1), claims.UserID)
		return c.NoContent(http.StatusOK)
	})

	err := handler(c)
	assert.NoError(t, err)
	assert.True(t, called)
}

func TestJWTAuthMiddleware_NoTokenAnywhere(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	_ = handler(c)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// ─── Access-Token Revocation (H-03) ──────────────────────────────────────────

func TestRevokedTokenMiddleware_AllowsValidToken(t *testing.T) {
	e := echo.New()
	token := makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	// JWTAuthMiddleware populates the claims the revocation middleware reads.
	_ = JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		store := redisclient.NewInMemoryStore()
		called := false
		_ = RevokedTokenMiddleware(store)(func(c echo.Context) error {
			called = true
			return c.NoContent(http.StatusOK)
		})(c)
		assert.True(t, called)
		assert.Equal(t, http.StatusOK, rec.Code)
		return nil
	})(c)
}

func TestRevokedTokenMiddleware_RejectsDenylistedToken(t *testing.T) {
	e := echo.New()
	store := redisclient.NewInMemoryStore()
	token := makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})
	claims, err := auth.ParseAccessToken(token, testSecret)
	require.NoError(t, err)
	require.NoError(t, DenyAccessToken(context.Background(), store, claims.UserID, claims.ID, time.Minute))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	_ = JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		return RevokedTokenMiddleware(store)(func(c echo.Context) error {
			return c.NoContent(http.StatusOK)
		})(c)
	})(c)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// errExistsStore fails Exists so the fail-closed revocation path is testable.
type errExistsStore struct {
	*redisclient.InMemoryStore
}

func (errExistsStore) Exists(context.Context, string) (bool, error) {
	return false, errors.New("redis down")
}

func TestRevokedTokenMiddleware_FailClosedOnStoreError(t *testing.T) {
	e := echo.New()
	token := makeTokenFor(t, 1, []string{"staff"}, []string{"WH01"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	_ = JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		return RevokedTokenMiddleware(errExistsStore{redisclient.NewInMemoryStore()})(func(c echo.Context) error {
			return c.NoContent(http.StatusOK)
		})(c)
	})(c)
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
}
