package logger

import (
	"context"
	"log/slog"
	"os"
)

type contextKey string

const RequestIDKey contextKey = "request_id"

// ContextHandler wraps a slog.Handler and automatically extracts the request ID from the context.
type ContextHandler struct {
	slog.Handler
}

// Handle adds the request_id attribute to the log record if it exists in the context.
func (h *ContextHandler) Handle(ctx context.Context, r slog.Record) error {
	if ctx != nil {
		if reqID, ok := ctx.Value(RequestIDKey).(string); ok && reqID != "" {
			r = r.Clone() // Clone to avoid mutation of base record
			r.AddAttrs(slog.String("request_id", reqID))
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
