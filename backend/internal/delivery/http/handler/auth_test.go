package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/middleware"
	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/auth"
	redisclient "inventory/internal/pkg/redis"
	"inventory/internal/pkg/validation"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "test-jwt-secret-handler"

// testUserLookup is a fixed mock user lookup function (by username).
func testUserLookup(passwordHash string) UserLookup {
	return func(ctx context.Context, username string) (int64, string, []string, []string, error) {
		if username == "alice" {
			return 1, passwordHash, []string{"staff"}, []string{"WH01"}, nil
		}
		return 0, "", nil, nil, fmt.Errorf("user not found")
	}
}

// testUserLookupByID is a fixed mock user lookup function (by user ID, used by refresh).
func testUserLookupByID() UserLookupByID {
	return func(ctx context.Context, userID int64) (string, []string, []string, error) {
		if userID == 1 {
			return "alice", []string{"staff"}, []string{"WH01"}, nil
		}
		return "", nil, nil, fmt.Errorf("user not found")
	}
}

func setupHandler(t *testing.T) (*AuthHandler, *echo.Echo, redisclient.KVStore) {
	t.Helper()
	hash, err := auth.HashPassword("correctPassword123!")
	require.NoError(t, err)
	store := redisclient.NewInMemoryStore()
	h := NewAuthHandler(testSecret, store, testUserLookup(hash), testUserLookupByID(), func(ctx context.Context, username, email, fullName, passwordHash string) (int64, error) {
		return 1, nil
	})

	e := echo.New()
	// Wire the validator so request validation behaves like production.
	e.Validator = validation.New()
	return h, e, store
}

// ─── Login Tests ─────────────────────────────────────────────────────────────

func TestLogin_Success(t *testing.T) {
	h, e, _ := setupHandler(t)

	body := `{"username":"alice","password":"correctPassword123!"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.Login(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)

	dataMap := resp.Data.(map[string]any)
	assert.NotEmpty(t, dataMap["access_token"])
	assert.NotEmpty(t, dataMap["refresh_token"])
	assert.Equal(t, "Bearer", dataMap["token_type"])
}

func TestLogin_WrongPassword(t *testing.T) {
	h, e, _ := setupHandler(t)

	body := `{"username":"alice","password":"wrongPassword"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	_ = h.Login(e.NewContext(req, rec))
	assert.Equal(t, http.StatusUnauthorized, rec.Code)

	var resp response.Response
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.False(t, resp.Success)
	assert.Equal(t, "ERR_UNAUTHENTICATED", resp.Error.Code)
}

func TestLogin_UnknownUser(t *testing.T) {
	h, e, _ := setupHandler(t)

	body := `{"username":"ghost","password":"anyPassword"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	_ = h.Login(e.NewContext(req, rec))
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestLogin_PerAccountRateLimit pins the H-02 per-(IP, username) login budget:
// after the account budget is exhausted the handler returns 429, even though
// the per-IP middleware limiter (not exercised here) would still allow it.
func TestLogin_PerAccountRateLimit(t *testing.T) {
	h, e, _ := setupHandler(t)

	login := func() int {
		body := `{"username":"alice","password":"wrongPassword"}`
		req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "10.0.0.99:5555"
		rec := httptest.NewRecorder()
		_ = h.Login(e.NewContext(req, rec))
		return rec.Code
	}

	for i := 0; i < loginUsernameMaxReqs; i++ {
		assert.Equal(t, http.StatusUnauthorized, login(), "attempt %d within budget", i+1)
	}
	// 6th attempt from the same IP+username is rejected.
	assert.Equal(t, http.StatusTooManyRequests, login())

	// A different account from the same IP is NOT throttled by this limiter.
	body := `{"username":"bob","password":"wrongPassword"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.0.0.99:5555"
	rec := httptest.NewRecorder()
	_ = h.Login(e.NewContext(req, rec))
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestLogin_NumericUsername guards against treating an all-digit username as a
// user ID: login must always look the user up by username, not parse it as an ID.
func TestLogin_NumericUsername(t *testing.T) {
	hash, err := auth.HashPassword("correctPassword123!")
	require.NoError(t, err)
	store := redisclient.NewInMemoryStore()

	lookup := func(ctx context.Context, username string) (int64, string, []string, []string, error) {
		if username == "123456" {
			return 7, hash, []string{"staff"}, []string{"WH01"}, nil
		}
		return 0, "", nil, nil, fmt.Errorf("user not found")
	}
	h := NewAuthHandler(testSecret, store, lookup, testUserLookupByID(), nil)

	e := echo.New()
	body := `{"username":"123456","password":"correctPassword123!"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err = h.Login(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
}

// ─── Refresh Tests ────────────────────────────────────────────────────────────

func loginAndGetTokens(t *testing.T, h *AuthHandler, e *echo.Echo) dto.LoginResponse {
	t.Helper()
	body := `{"username":"alice","password":"correctPassword123!"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	require.NoError(t, h.Login(e.NewContext(req, rec)))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	data := resp.Data.(map[string]any)
	return dto.LoginResponse{
		AccessToken:  data["access_token"].(string),
		RefreshToken: data["refresh_token"].(string),
		TokenType:    data["token_type"].(string),
	}
}

func TestRefresh_Success(t *testing.T) {
	h, e, _ := setupHandler(t)
	tokens := loginAndGetTokens(t, h, e)

	body := fmt.Sprintf(`{"refresh_token":"%s"}`, tokens.RefreshToken)
	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.Refresh(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	data := resp.Data.(map[string]any)
	assert.NotEmpty(t, data["access_token"])
	// New refresh token must be different from original
	assert.NotEqual(t, tokens.RefreshToken, data["refresh_token"])
}

// TestRefresh_PreservesUsernameClaim guards against the refresh flow issuing an
// access token whose username claim is the numeric user ID instead of the username.
func TestRefresh_PreservesUsernameClaim(t *testing.T) {
	h, e, _ := setupHandler(t)
	tokens := loginAndGetTokens(t, h, e)

	body := fmt.Sprintf(`{"refresh_token":"%s"}`, tokens.RefreshToken)
	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.Refresh(e.NewContext(req, rec))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	data := resp.Data.(map[string]any)

	claims, err := auth.ParseAccessToken(data["access_token"].(string), testSecret)
	require.NoError(t, err)
	assert.Equal(t, "alice", claims.Username)
	assert.Equal(t, int64(1), claims.UserID)
}

func TestRefresh_RevokedToken(t *testing.T) {
	h, e, _ := setupHandler(t)
	tokens := loginAndGetTokens(t, h, e)

	// First refresh consumes the token
	body := fmt.Sprintf(`{"refresh_token":"%s"}`, tokens.RefreshToken)
	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	_ = h.Refresh(e.NewContext(req, rec))
	require.Equal(t, http.StatusOK, rec.Code)

	// Second use of same old refresh token must fail (token rotation)
	req2 := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	_ = h.Refresh(e.NewContext(req2, rec2))
	assert.Equal(t, http.StatusUnauthorized, rec2.Code, "re-using old refresh token must fail")
}

func TestRefresh_InvalidToken(t *testing.T) {
	h, e, _ := setupHandler(t)

	body := `{"refresh_token":"this.is.garbage"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	_ = h.Refresh(e.NewContext(req, rec))
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestRefresh_ReuseRevokesFamily pins the M-03 fix: replaying a consumed
// refresh token is treated as compromise — the whole refresh family for that
// user is purged, so every other active session is signed out too.
func TestRefresh_ReuseRevokesFamily(t *testing.T) {
	h, e, _ := setupHandler(t)

	sessionA := loginAndGetTokens(t, h, e)
	sessionB := loginAndGetTokens(t, h, e)

	refresh := func(token string) int {
		body := fmt.Sprintf(`{"refresh_token":"%s"}`, token)
		req := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		_ = h.Refresh(e.NewContext(req, rec))
		return rec.Code
	}

	// First use of A consumes it and is fine.
	require.Equal(t, http.StatusOK, refresh(sessionA.RefreshToken))
	// Second use of A is a replay → family revoked.
	require.Equal(t, http.StatusUnauthorized, refresh(sessionA.RefreshToken))
	// Session B's refresh token must now be dead too.
	assert.Equal(t, http.StatusUnauthorized, refresh(sessionB.RefreshToken),
		"reuse must revoke the entire refresh family, not just the replayed token")
}

// ─── Logout Tests ─────────────────────────────────────────────────────────────

func TestLogout_Success(t *testing.T) {
	h, e, store := setupHandler(t)
	tokens := loginAndGetTokens(t, h, e)

	body := fmt.Sprintf(`{"refresh_token":"%s"}`, tokens.RefreshToken)
	req := httptest.NewRequest(http.MethodPost, "/auth/logout", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	err := h.Logout(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)
	_ = store // verify token was deleted — refresh should fail now

	// Confirm refresh with the same token fails after logout
	req2 := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	_ = h.Refresh(e.NewContext(req2, rec2))
	assert.Equal(t, http.StatusUnauthorized, rec2.Code, "refresh after logout must fail")
}

// TestLogout_DenylistsAccessToken pins the H-03 fix: logout also denylists the
// access token's JTI, so the protected middleware chain rejects it immediately
// instead of leaving it valid for its remaining ~15 minutes.
func TestLogout_DenylistsAccessToken(t *testing.T) {
	h, e, store := setupHandler(t)
	tokens := loginAndGetTokens(t, h, e)

	body := fmt.Sprintf(`{"refresh_token":"%s"}`, tokens.RefreshToken)
	req := httptest.NewRequest(http.MethodPost, "/auth/logout", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	rec := httptest.NewRecorder()
	require.NoError(t, h.Logout(e.NewContext(req, rec)))
	assert.Equal(t, http.StatusOK, rec.Code)

	// The access token must now be denylisted — replay it through the
	// protected chain (JWTAuth → RevokedToken) and expect 401.
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	_ = middleware.JWTAuthMiddleware(testSecret)(func(c echo.Context) error {
		return middleware.RevokedTokenMiddleware(store)(func(c echo.Context) error {
			return c.NoContent(http.StatusOK)
		})(c)
	})(c2)
	assert.Equal(t, http.StatusUnauthorized, rec2.Code, "access token must be rejected after logout")
}

// ─── Register Tests ────────────────────────────────────────────────────────────

func TestRegister_Success(t *testing.T) {
	h, e, _ := setupHandler(t)

	body := `{"username":"carol","email":"carol@example.com","full_name":"Carol","password":"correctPassword123!"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.Register(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
}

func TestRegister_CreateServiceNotInitialized(t *testing.T) {
	store := redisclient.NewInMemoryStore()
	h := NewAuthHandler(testSecret, store, testUserLookup(""), nil, nil)
	e := echo.New()

	body := `{"username":"carol","email":"carol@example.com","full_name":"Carol","password":"correctPassword123!"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	_ = h.Register(e.NewContext(req, rec))
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestLogin_SetsAuthCookies(t *testing.T) {
	h, e, _ := setupHandler(t)

	body := `{"username":"alice","password":"correctPassword123!"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.Login(e.NewContext(req, rec))
	require.NoError(t, err)

	cookies := rec.Result().Cookies()
	byName := map[string]*http.Cookie{}
	for _, ck := range cookies {
		byName[ck.Name] = ck
	}

	access, ok := byName["access_token"]
	require.True(t, ok, "access_token cookie must be set")
	assert.NotEmpty(t, access.Value)
	assert.True(t, access.HttpOnly)
	assert.Equal(t, "/", access.Path)
	assert.Equal(t, http.SameSiteLaxMode, access.SameSite)
	assert.Equal(t, int(auth.AccessTokenTTL.Seconds()), access.MaxAge)

	refresh, ok := byName["refresh_token"]
	require.True(t, ok, "refresh_token cookie must be set")
	assert.NotEmpty(t, refresh.Value)
	assert.True(t, refresh.HttpOnly)
	assert.Equal(t, "/api/v1/auth", refresh.Path)
}

func TestLogout_ClearsAuthCookies(t *testing.T) {
	h, e, _ := setupHandler(t)
	tokens := loginAndGetTokens(t, h, e)

	body := fmt.Sprintf(`{"refresh_token":"%s"}`, tokens.RefreshToken)
	req := httptest.NewRequest(http.MethodPost, "/auth/logout", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := h.Logout(e.NewContext(req, rec))
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	for _, ck := range rec.Result().Cookies() {
		assert.Empty(t, ck.Value, "%s cookie must be cleared", ck.Name)
		assert.True(t, ck.MaxAge < 0, "%s cookie must be expired", ck.Name)
	}
}
