package middleware

import (
	"context"
	"inventory/internal/pkg/logger"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// RequestID extracts or generates a unique request ID (UUID) for each request,
// sets it in the response header, and injects it into the request's context.
func RequestID() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			reqID := c.Request().Header.Get("X-Request-Id")
			if reqID == "" {
				reqID = uuid.New().String()
			}

			// Add to response header
			c.Response().Header().Set("X-Request-Id", reqID)

			// Propagate through request context so slog can extract it
			ctx := context.WithValue(c.Request().Context(), logger.RequestIDKey, reqID)
			c.SetRequest(c.Request().WithContext(ctx))

			// Also store it in Echo context for handlers to access
			c.Set("request_id", reqID)

			return next(c)
		}
	}
}
