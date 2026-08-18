package logger

import (
	"context"
	"log/slog"
	"os"
)

type contextKey string

const (
	// RequestIDKey carries the per-request correlation ID (set by the RequestID middleware).
	RequestIDKey contextKey = "request_id"
	// UserIDKey carries the authenticated user ID (set by the JWT middleware).
	UserIDKey contextKey = "user_id"
)

// ContextHandler wraps a slog.Handler and automatically extracts the request ID
// and authenticated user ID from the context (structured logging, FSD 10.5).
type ContextHandler struct {
	slog.Handler
}

// Handle adds the request_id and user_id attributes to the log record if they
// exist in the context.
func (h *ContextHandler) Handle(ctx context.Context, r slog.Record) error {
	if ctx != nil {
		cloned := false
		if reqID, ok := ctx.Value(RequestIDKey).(string); ok && reqID != "" {
			r = r.Clone() // Clone to avoid mutation of base record
			cloned = true
			r.AddAttrs(slog.String("request_id", reqID))
		}
		if userID, ok := ctx.Value(UserIDKey).(int64); ok && userID > 0 {
			if !cloned {
				r = r.Clone()
				cloned = true
			}
			r.AddAttrs(slog.Int64("user_id", userID))
		}
	}
	return h.Handler.Handle(ctx, r)
}

// Init initializes the default slog logger based on the application environment.
func Init(env string) *slog.Logger {
	var handler slog.Handler
	if env == "production" || env == "staging" {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}

	logger := slog.New(&ContextHandler{Handler: handler})
	slog.SetDefault(logger)
	return logger
}

// Level helpers emit a structured log line at an explicit severity level.
// They log through slog.Default() — the ContextHandler-wrapped logger set by
// Init — so request_id and user_id are attached automatically when present
// in ctx. Prefer these over the bare slog package functions so the level is
// always explicit at the call site.

// Debug logs at DEBUG level — verbose detail / troubleshooting only.
func Debug(ctx context.Context, msg string, args ...any) {
	slog.Log(ctx, slog.LevelDebug, msg, args...)
}

// Info logs at INFO level — normal successful operation.
func Info(ctx context.Context, msg string, args ...any) {
	slog.Log(ctx, slog.LevelInfo, msg, args...)
}

// Warn logs at WARN level — recoverable problem (a "warning").
func Warn(ctx context.Context, msg string, args ...any) {
	slog.Log(ctx, slog.LevelWarn, msg, args...)
}

// Error logs at ERROR level — failure needing attention.
func Error(ctx context.Context, msg string, args ...any) {
	slog.Log(ctx, slog.LevelError, msg, args...)
}
