package logger

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestContextHandler_Handle(t *testing.T) {
	var buf bytes.Buffer
	jsonHandler := slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})
	logger := slog.New(&ContextHandler{Handler: jsonHandler})

	ctx := context.WithValue(context.Background(), RequestIDKey, "test-req-id-123")
	logger.InfoContext(ctx, "hello test")

	var parsed map[string]any
	err := json.Unmarshal(buf.Bytes(), &parsed)
	assert.NoError(t, err)

	assert.Equal(t, "hello test", parsed["msg"])
	assert.Equal(t, "test-req-id-123", parsed["request_id"])
}

func TestContextHandler_NoRequestID(t *testing.T) {
	var buf bytes.Buffer
	jsonHandler := slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})
	logger := slog.New(&ContextHandler{Handler: jsonHandler})

	logger.InfoContext(context.Background(), "hello without id")

	var parsed map[string]any
	err := json.Unmarshal(buf.Bytes(), &parsed)
	assert.NoError(t, err)

	assert.Equal(t, "hello without id", parsed["msg"])
	_, exists := parsed["request_id"]
	assert.False(t, exists)
}

func TestInit(t *testing.T) {
	lProd := Init("production")
	assert.NotNil(t, lProd)

	lDev := Init("development")
	assert.NotNil(t, lDev)
}
