package middleware

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"time"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/auth"
	redisclient "inventory/internal/pkg/redis"

	"github.com/labstack/echo/v4"
)

// accessDenyTTL is how long a revoked access JTI stays denylisted. Access
// tokens live 15 minutes, so the denylist entry never needs to outlive that.
const accessDenyTTL = auth.AccessTokenTTL

// accessDenyKey is the Redis key that denylists a revoked access-token JTI
// (H-03). The JTI is hashed so the raw token value is never stored.
func accessDenyKey(userID int64, jti string) string {
	h := sha256.Sum256([]byte(jti))
	return fmt.Sprintf("access-deny:%d:%x", userID, h)
}

// RevokedTokenMiddleware rejects access tokens whose JTI has been denylisted
// (H-03). It runs after JWTAuthMiddleware so the parsed claims — including the
// JTI — are already in context; the check is a single Redis EXISTS (~0.2ms).
//
// Fail-closed: if the store is unreachable the request is rejected, so an
// outage cannot quietly re-enable a revoked token.
func RevokedTokenMiddleware(store redisclient.KVStore) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			claims, ok := GetClaims(c)
			if !ok || claims == nil || claims.ID == "" {
				// No claims to check (JWTAuthMiddleware already rejected the
				// request, or the route has no auth). Nothing to do.
				return next(c)
			}

			denied, err := store.Exists(c.Request().Context(), accessDenyKey(claims.UserID, claims.ID))
			if err != nil {
				return response.Error(c, http.StatusServiceUnavailable,
					"ERR_SERVICE_UNAVAILABLE", "Session check unavailable, try again", nil,
					reqID(c))
			}
			if denied {
				return response.Error(c, http.StatusUnauthorized,
					"ERR_UNAUTHENTICATED", "Token has been revoked", nil,
					reqID(c))
			}
			return next(c)
		}
	}
}

// DenyAccessToken denylists an access token's JTI (H-03), populating the same
// key the middleware checks. ttl is the token's remaining lifetime, so the
// denylist entry expires with the token.
func DenyAccessToken(ctx context.Context, store redisclient.KVStore, userID int64, jti string, ttl time.Duration) error {
	if jti == "" || ttl <= 0 {
		return nil
	}
	if ttl > accessDenyTTL {
		ttl = accessDenyTTL
	}
	return store.Set(ctx, accessDenyKey(userID, jti), "1", ttl)
}
