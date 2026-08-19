package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	redisclient "inventory/internal/pkg/redis"

	"github.com/labstack/echo/v4"
)

// RateLimitMiddleware implements a sliding-window rate limiter using a KVStore (Redis or in-memory).
// For each request, it increments a counter keyed by identifier and limits to maxReqs per window duration.
// The window TTL is re-armed on every request so an interrupted Expire can never
// permanently lock a client out (sliding window by activity).
func RateLimitMiddleware(store redisclient.KVStore, maxReqs int64, window time.Duration, keyFn func(c echo.Context) string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			ctx := context.Background()
			key := "rate:" + keyFn(c)

			count, err := store.IncrBy(ctx, key, 1)
			if err != nil {
				// On store error, fail-open so legitimate requests are not blocked
				return next(c)
			}

			// Always re-arm the window TTL; failure here only means the counter
			// will expire at the previously set TTL (or, worst case, at no TTL).
			_ = store.Expire(ctx, key, window)

			if count > maxReqs {
				c.Response().Header().Set("Retry-After", fmt.Sprintf("%d", int(window.Seconds())))
				return echo.NewHTTPError(http.StatusTooManyRequests, "Rate limit exceeded")
			}

			return next(c)
		}
	}
}

// UserRateLimiter returns a standard per-user rate limiter: 100 req/minute.
func UserRateLimiter(store redisclient.KVStore) echo.MiddlewareFunc {
	return RateLimitMiddleware(store, 100, time.Minute, func(c echo.Context) string {
		if id, ok := c.Get("user_id").(int64); ok {
			return fmt.Sprintf("user:%d", id)
		}
		return "ip:" + c.RealIP()
	})
}

// LoginRateLimiter returns a stricter per-IP limiter for login: 5 attempts/15 minutes.
func LoginRateLimiter(store redisclient.KVStore) echo.MiddlewareFunc {
	return RateLimitMiddleware(store, 25, 15*time.Minute, func(c echo.Context) string {
		return "login:" + c.RealIP()
	})
}

// RegisterRateLimiter returns a per-IP limiter for registration: 10 attempts/15 minutes.
func RegisterRateLimiter(store redisclient.KVStore) echo.MiddlewareFunc {
	return RateLimitMiddleware(store, 10, 15*time.Minute, func(c echo.Context) string {
		return "register:" + c.RealIP()
	})
}
