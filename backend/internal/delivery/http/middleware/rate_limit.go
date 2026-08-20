package middleware

import (
	"fmt"
	"net/http"
	"time"

	redisclient "inventory/internal/pkg/redis"

	"github.com/labstack/echo/v4"
)

// RateLimitOptions configures the rate limiter behavior.
type RateLimitOptions struct {
	MaxReqs    int64
	Window     time.Duration
	KeyFn      func(c echo.Context) string
	FailClosed bool
}

// RateLimitMiddleware implements a rate limiter using a KVStore (Redis or in-memory).
func RateLimitMiddleware(store redisclient.KVStore, maxReqs int64, window time.Duration, keyFn func(c echo.Context) string) echo.MiddlewareFunc {
	return RateLimitMiddlewareWithOptions(store, RateLimitOptions{
		MaxReqs:    maxReqs,
		Window:     window,
		KeyFn:      keyFn,
		FailClosed: false,
	})
}

// RateLimitMiddlewareWithOptions creates a rate limiter with custom failure behavior.
func RateLimitMiddlewareWithOptions(store redisclient.KVStore, opts RateLimitOptions) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			ctx := c.Request().Context()
			key := "rate:" + opts.KeyFn(c)

			count, err := store.IncrBy(ctx, key, 1)
			if err != nil {
				if opts.FailClosed {
					return echo.NewHTTPError(http.StatusServiceUnavailable, "Rate limiter unavailable")
				}
				// On non-critical endpoints, fail-open
				return next(c)
			}

			// Re-arm or set TTL on initial count
			_ = store.Expire(ctx, key, opts.Window)

			remaining := opts.MaxReqs - count
			if remaining < 0 {
				remaining = 0
			}

			c.Response().Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", opts.MaxReqs))
			c.Response().Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))

			if count > opts.MaxReqs {
				c.Response().Header().Set("Retry-After", fmt.Sprintf("%d", int(opts.Window.Seconds())))
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

// LoginRateLimiter returns a per-IP limiter for login: 25 attempts/15 minutes with fail-closed security.
func LoginRateLimiter(store redisclient.KVStore) echo.MiddlewareFunc {
	return RateLimitMiddlewareWithOptions(store, RateLimitOptions{
		MaxReqs:    25,
		Window:     15 * time.Minute,
		KeyFn:      func(c echo.Context) string { return "login:" + c.RealIP() },
		FailClosed: true,
	})
}

// RegisterRateLimiter returns a per-IP limiter for registration: 10 attempts/15 minutes with fail-closed security.
func RegisterRateLimiter(store redisclient.KVStore) echo.MiddlewareFunc {
	return RateLimitMiddlewareWithOptions(store, RateLimitOptions{
		MaxReqs:    10,
		Window:     15 * time.Minute,
		KeyFn:      func(c echo.Context) string { return "register:" + c.RealIP() },
		FailClosed: true,
	})
}
