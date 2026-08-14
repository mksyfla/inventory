package middleware

import (
	"strings"

	"github.com/labstack/echo/v4"
)

// SecurityHeaders adds standard HTTP security headers to every response per FSD §6.
// The optional appEnv enables HSTS in production; behind a TLS-terminating proxy
// HSTS is also enabled when X-Forwarded-Proto is https.
func SecurityHeaders(appEnv ...string) echo.MiddlewareFunc {
	env := ""
	if len(appEnv) > 0 {
		env = appEnv[0]
	}

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			h := c.Response().Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("X-XSS-Protection", "1; mode=block")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			h.Set("Cross-Origin-Opener-Policy", "same-origin")

			// Swagger UI serves its own static assets (cacheable); API responses must not be cached.
			if strings.HasPrefix(c.Request().URL.Path, "/swagger") {
				h.Set("Cache-Control", "public, max-age=86400")
				h.Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:")
			} else {
				h.Set("Cache-Control", "no-store")
				h.Set("Content-Security-Policy", "default-src 'self'")
			}

			if env == "production" || strings.EqualFold(c.Request().Header.Get("X-Forwarded-Proto"), "https") {
				h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			return next(c)
		}
	}
}
