package handler

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/middleware"
	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/auth"
	redisclient "inventory/internal/pkg/redis"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
)

// Per-account login budget (H-02): complements the per-IP middleware limiter
// so an attacker who rotates source IPs still cannot brute-force one account.
// Stricter than the IP budget (25/15min) by design.
const (
	loginUsernameMaxReqs = 5
	loginUsernameWindow  = 15 * time.Minute
)

// dummyArgon2idHash is a valid Argon2id hash used to equalize execution time on unknown usernames.
const dummyArgon2idHash = "$argon2id$v=19$m=65536,t=3,p=2$dHVtbXlzYWx0MTIzNDU2$O1dO5w/cZkO0+qfTfEaB2lW8zP7oN1rG9V0sI4hL2kM"

// UserLookup is a function type to fetch user credentials by username.
// In production this would call the repository; in tests it can be mocked.
type UserLookup func(ctx context.Context, username string) (userID int64, passwordHash string, roles []string, warehouses []string, err error)

// UserLookupByID is a function type to fetch user credentials by numeric user ID.
// Used by the refresh flow, where only the token subject (user ID) is known.
type UserLookupByID func(ctx context.Context, userID int64) (username string, roles []string, warehouses []string, err error)

// CreateUserFunc is a function type to create a new user record and return its ID.
type CreateUserFunc func(ctx context.Context, username, email, fullName, passwordHash string) (userID int64, err error)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	jwtSecret      string
	store          redisclient.KVStore
	lookupUser     UserLookup
	lookupUserByID UserLookupByID
	createUser     CreateUserFunc
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(jwtSecret string, store redisclient.KVStore, lookupUser UserLookup, lookupUserByID UserLookupByID, createUser CreateUserFunc) *AuthHandler {
	return &AuthHandler{
		jwtSecret:      jwtSecret,
		store:          store,
		lookupUser:     lookupUser,
		lookupUserByID: lookupUserByID,
		createUser:     createUser,
	}
}

// Register handles POST /api/v1/auth/register.
// Creates a new user with an Argon2id-hashed password (FSD 2.1).
func (h *AuthHandler) Register(c echo.Context) error {
	var req dto.RegisterRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	if h.createUser == nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Auth user creation service is not initialized", nil, reqID(c))
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		if errors.Is(err, auth.ErrPasswordHashBusy) {
			return response.Error(c, http.StatusServiceUnavailable, "ERR_SERVICE_UNAVAILABLE", "Registration is busy, try again", nil, reqID(c))
		}
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to hash password", nil, reqID(c))
	}

	userID, err := h.createUser(c.Request().Context(), req.Username, req.Email, req.FullName, passwordHash)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return response.Error(c, http.StatusConflict, "ERR_CONFLICT", "Username or email already exists", nil, reqID(c))
		}
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to create user", nil, reqID(c))
	}

	return response.Success(c, http.StatusCreated, dto.RegisterResponse{
		ID:       userID,
		Username: req.Username,
		FullName: req.FullName,
	}, nil)
}

// Login handles POST /api/v1/auth/login.
// Verifies credentials, generates access + refresh token pair, and stores hashed refresh JTI in Redis.
func (h *AuthHandler) Login(c echo.Context) error {
	var req dto.LoginRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	// H-02: per-(IP, username) budget on top of the per-IP middleware limiter.
	// Runs before the lookup so unknown usernames also consume the budget.
	if err := h.checkLoginUserRateLimit(c, req.Username); err != nil {
		return err
	}

	if h.lookupUser == nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Auth lookup service is not initialized", nil, reqID(c))
	}

	userID, passwordHash, roles, warehouses, err := h.lookupUser(c.Request().Context(), req.Username)
	if err != nil {
		// Timing attack mitigation (H-11): perform dummy password verification so
		// an unknown username costs the same Argon2 derivation as a known one.
		if _, derr := auth.VerifyPassword(req.Password, dummyArgon2idHash); errors.Is(derr, auth.ErrPasswordHashBusy) {
			return response.Error(c, http.StatusServiceUnavailable, "ERR_SERVICE_UNAVAILABLE", "Login is busy, try again", nil, reqID(c))
		}
		return response.Error(c, http.StatusUnauthorized, "ERR_UNAUTHENTICATED", "Invalid credentials", nil, reqID(c))
	}

	match, err := auth.VerifyPassword(req.Password, passwordHash)
	if errors.Is(err, auth.ErrPasswordHashBusy) {
		return response.Error(c, http.StatusServiceUnavailable, "ERR_SERVICE_UNAVAILABLE", "Login is busy, try again", nil, reqID(c))
	}
	if err != nil || !match {
		return response.Error(c, http.StatusUnauthorized, "ERR_UNAUTHENTICATED", "Invalid credentials", nil, reqID(c))
	}

	pair, err := auth.GenerateTokenPair(userID, req.Username, roles, warehouses, h.jwtSecret)
	if err != nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to generate tokens", nil, reqID(c))
	}

	// Store hashed refresh JTI in Redis with 7-day TTL
	hashedJTI := hashJTI(pair.RefreshJTI)
	redisKey := refreshKey(userID, hashedJTI)
	if err := h.store.Set(c.Request().Context(), redisKey, "1", auth.RefreshTokenTTL); err != nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to store session", nil, reqID(c))
	}

	// Set HttpOnly cookies for browser clients (Bearer header still supported)
	setAuthCookies(c, pair)

	return response.Success(c, http.StatusOK, dto.LoginResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		TokenType:    "Bearer",
	}, nil)
}

// Refresh handles POST /api/v1/auth/refresh.
// Validates the old refresh token, revokes it, and issues a new token pair (Rotating Refresh Token).
func (h *AuthHandler) Refresh(c echo.Context) error {
	var req dto.RefreshRequest
	_ = c.Bind(&req)

	refreshToken := req.RefreshToken
	if refreshToken == "" {
		if cookie, err := c.Cookie(auth.RefreshTokenCookieName); err == nil && cookie.Value != "" {
			refreshToken = cookie.Value
		}
	}

	if refreshToken == "" {
		return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION", "Missing refresh token in request body or cookie", nil, reqID(c))
	}

	claims, err := auth.ParseRefreshToken(refreshToken, h.jwtSecret)
	if err != nil {
		return response.Error(c, http.StatusUnauthorized, "ERR_UNAUTHENTICATED", "Invalid or expired refresh token", nil, reqID(c))
	}

	userID, parseErr := strconv.ParseInt(claims.Subject, 10, 64)
	if parseErr != nil {
		return response.Error(c, http.StatusUnauthorized, "ERR_UNAUTHENTICATED", "Invalid token subject", nil, reqID(c))
	}

	// Verify the JTI exists in Redis (token not revoked)
	hashedJTI := hashJTI(claims.ID)
	redisKey := refreshKey(userID, hashedJTI)
	exists, err := h.store.Exists(c.Request().Context(), redisKey)
	if err != nil {
		return response.Error(c, http.StatusUnauthorized, "ERR_UNAUTHENTICATED", "Refresh token has been revoked", nil, reqID(c))
	}
	if !exists {
		// M-03: a valid-but-consumed refresh token is the signature of reuse.
		// Treat it as compromise and revoke the whole family — all active
		// sessions for this user — rather than just 401-ing the one token.
		_ = h.store.DelPattern(c.Request().Context(), fmt.Sprintf("refresh:%d:*", userID))
		return response.Error(c, http.StatusUnauthorized, "ERR_UNAUTHENTICATED", "Refresh token has been revoked", nil, reqID(c))
	}

	// Revoke the old refresh token
	_ = h.store.Del(c.Request().Context(), redisKey)

	// Fetch fresh user details for the new token
	if h.lookupUserByID == nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Auth lookup service is not initialized", nil, reqID(c))
	}
	username, roles, warehouses, err := h.lookupUserByID(c.Request().Context(), userID)
	if err != nil {
		return response.Error(c, http.StatusUnauthorized, "ERR_UNAUTHENTICATED", "User no longer exists", nil, reqID(c))
	}

	// Issue new token pair
	pair, err := auth.GenerateTokenPair(userID, username, roles, warehouses, h.jwtSecret)
	if err != nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to generate new tokens", nil, reqID(c))
	}

	// Store new refresh JTI
	newHashedJTI := hashJTI(pair.RefreshJTI)
	newKey := refreshKey(userID, newHashedJTI)
	if err := h.store.Set(c.Request().Context(), newKey, "1", auth.RefreshTokenTTL); err != nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to store session", nil, reqID(c))
	}

	// Rotate the auth cookies as well
	setAuthCookies(c, pair)

	return response.Success(c, http.StatusOK, dto.RefreshResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		TokenType:    "Bearer",
	}, nil)
}

// Logout handles POST /api/v1/auth/logout.
// Revokes the provided refresh token from Redis.
func (h *AuthHandler) Logout(c echo.Context) error {
	var req dto.RefreshRequest
	_ = c.Bind(&req)

	refreshToken := req.RefreshToken
	if refreshToken == "" {
		if cookie, err := c.Cookie(auth.RefreshTokenCookieName); err == nil && cookie.Value != "" {
			refreshToken = cookie.Value
		}
	}

	if refreshToken != "" {
		if claims, err := auth.ParseRefreshToken(refreshToken, h.jwtSecret); err == nil {
			userID, _ := strconv.ParseInt(claims.Subject, 10, 64)
			hashedJTI := hashJTI(claims.ID)
			_ = h.store.Del(c.Request().Context(), refreshKey(userID, hashedJTI))
		}
	}

	// H-03: denylist the access token's JTI so it stops working immediately
	// (RevokedTokenMiddleware checks the denylist on every protected request)
	// instead of remaining valid for its full 15 minutes.
	if accessToken := accessTokenFromRequest(c); accessToken != "" {
		if claims, err := auth.ParseAccessToken(accessToken, h.jwtSecret); err == nil {
			ttl := auth.AccessTokenTTL
			if claims.ExpiresAt != nil {
				ttl = time.Until(claims.ExpiresAt.Time)
			}
			_ = middleware.DenyAccessToken(c.Request().Context(), h.store, claims.UserID, claims.ID, ttl)
		}
	}

	// Expire the auth cookies on the client across all paths
	clearAuthCookies(c)

	return response.Success(c, http.StatusOK, "logged out", nil)
}

// accessTokenFromRequest extracts the access token from the Authorization
// header, falling back to the access_token cookie set on login.
func accessTokenFromRequest(c echo.Context) string {
	authHeader := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	if cookie, err := c.Cookie(auth.AccessTokenCookieName); err == nil {
		return cookie.Value
	}
	return ""
}

// checkLoginUserRateLimit enforces the per-(IP, username) login budget (H-02).
// It lives in the handler because the username is only known after the body is
// decoded. Fail-closed: a store outage returns 503 rather than silently
// disabling brute-force protection. Same fixed-window semantics as the
// middleware limiter — the TTL is armed once per window, never re-armed.
func (h *AuthHandler) checkLoginUserRateLimit(c echo.Context, username string) error {
	key := fmt.Sprintf("login-user:%s:%s", c.RealIP(), strings.ToLower(strings.TrimSpace(username)))
	ctx := c.Request().Context()

	count, err := h.store.IncrBy(ctx, key, 1)
	if err != nil {
		return response.Error(c, http.StatusServiceUnavailable, "ERR_SERVICE_UNAVAILABLE", "Login temporarily unavailable", nil, reqID(c))
	}
	if count == 1 {
		if err := h.store.ExpireNX(ctx, key, loginUsernameWindow); err != nil {
			return response.Error(c, http.StatusServiceUnavailable, "ERR_SERVICE_UNAVAILABLE", "Login temporarily unavailable", nil, reqID(c))
		}
	}
	if count > loginUsernameMaxReqs {
		return response.Error(c, http.StatusTooManyRequests, "ERR_RATE_LIMIT", "Too many login attempts, try again later", nil, reqID(c))
	}
	return nil
}

// hashJTI creates a SHA-256 hex digest of a JTI to avoid storing the raw token value.
func hashJTI(jti string) string {
	h := sha256.Sum256([]byte(jti))
	return fmt.Sprintf("%x", h)
}

// refreshKey generates the Redis key for a refresh token entry.
func refreshKey(userID int64, hashedJTI string) string {
	return fmt.Sprintf("refresh:%d:%s", userID, hashedJTI)
}

// reqID extracts the request ID from the Echo context (set by RequestID middleware).
func reqID(c echo.Context) string {
	id, _ := c.Get("request_id").(string)
	return id
}

// requestIsTLS reports whether the request arrived over TLS (directly or via
// a TLS-terminating proxy), which decides the Secure cookie flag.
func requestIsTLS(c echo.Context) bool {
	return c.Request().TLS != nil ||
		strings.EqualFold(c.Request().Header.Get("X-Forwarded-Proto"), "https")
}

// setAuthCookies stores the token pair as HttpOnly cookies for browser clients
// (fallback to the Authorization header remains supported).
func setAuthCookies(c echo.Context, pair *auth.TokenPair) {
	secure := requestIsTLS(c)

	access := &http.Cookie{
		Name:     auth.AccessTokenCookieName,
		Value:    pair.AccessToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		MaxAge:   int(auth.AccessTokenTTL.Seconds()),
	}
	refresh := &http.Cookie{
		Name:     auth.RefreshTokenCookieName,
		Value:    pair.RefreshToken,
		Path:     "/api/v1/auth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		MaxAge:   int(auth.RefreshTokenTTL.Seconds()),
	}
	c.SetCookie(access)
	c.SetCookie(refresh)
}

// clearAuthCookies expires both auth cookies (used on logout).
func clearAuthCookies(c echo.Context) {
	secure := requestIsTLS(c)
	for _, name := range []string{auth.AccessTokenCookieName, auth.RefreshTokenCookieName} {
		for _, path := range []string{"/", "/api/v1/auth"} {
			c.SetCookie(&http.Cookie{
				Name:     name,
				Value:    "",
				Path:     path,
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
				Secure:   secure,
				MaxAge:   -1,
			})
		}
	}
}
