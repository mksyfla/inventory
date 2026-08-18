package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
)

// AccessLog mencatat setiap request HTTP dalam satu baris structured log:
// method, route pattern, status, durasi, ukuran respons, remote IP.
// request_id dan user_id ditambahkan otomatis oleh logger.ContextHandler
// dari context request (dipakai untuk tracing per request, FSD 10.5).
//
// Level: 5xx → ERROR, 4xx → WARN, sukses → INFO. Health probes (/healthz,
// /readyz) dicatat di DEBUG agar tidak membanjiri log dari healthcheck
// container (compose men-poll tiap 30 detik).
func AccessLog(log *slog.Logger) echo.MiddlewareFunc {
	if log == nil {
		log = slog.Default()
	}

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)

			// Errors ditulis oleh HTTPErrorHandler setelah chain selesai,
			// jadi status respons belum ter-set — petakan err ke kode HTTP
			// (pola yang sama dengan metrics middleware).
			status := c.Response().Status
			if err != nil {
				status = http.StatusInternalServerError
				if he, ok := err.(*echo.HTTPError); ok {
					status = he.Code
				}
			}
			if status == 0 {
				status = http.StatusOK
			}

			attrs := []slog.Attr{
				slog.String("method", c.Request().Method),
				slog.String("path", c.Path()),
				slog.Int("status", status),
				slog.Int64("duration_ms", time.Since(start).Milliseconds()),
				slog.Int64("bytes_out", c.Response().Size),
				slog.String("remote_ip", c.RealIP()),
			}

			// ctx request membawa request_id (RequestID middleware) dan
			// user_id (JWTAuth middleware) — ContextHandler menambahkannya.
			ctx := c.Request().Context()
			switch {
			case status >= 500:
				log.LogAttrs(ctx, slog.LevelError, "request failed", attrs...)
			case status >= 400:
				log.LogAttrs(ctx, slog.LevelWarn, "request rejected", attrs...)
			case c.Path() == "/healthz" || c.Path() == "/readyz":
				log.LogAttrs(ctx, slog.LevelDebug, "health probe", attrs...)
			default:
				log.LogAttrs(ctx, slog.LevelInfo, "request", attrs...)
			}

			return err
		}
	}
}
