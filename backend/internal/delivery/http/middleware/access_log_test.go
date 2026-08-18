package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"inventory/internal/pkg/logger"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newCaptureLogger builds a slog logger that appends JSON lines to buf.
func newCaptureLogger(buf *bytes.Buffer) *slog.Logger {
	return slog.New(&logger.ContextHandler{Handler: slog.NewJSONHandler(buf, nil)})
}

// lastLogLine parses the final JSON line from the capture buffer.
func lastLogLine(t *testing.T, buf *bytes.Buffer) map[string]any {
	t.Helper()
	var parsed map[string]any
	lines := bytes.Split(bytes.TrimSpace(buf.Bytes()), []byte("\n"))
	require.NotEmpty(t, lines)
	require.NoError(t, json.Unmarshal(lines[len(lines)-1], &parsed))
	return parsed
}

func TestAccessLog_Success(t *testing.T) {
	var buf bytes.Buffer
	e := echo.New()
	e.Use(RequestID())
	e.Use(AccessLog(newCaptureLogger(&buf)))
	e.GET("/hello", func(c echo.Context) error {
		return c.String(http.StatusOK, "world")
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/hello", nil)
	e.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	line := lastLogLine(t, &buf)
	assert.Equal(t, "request", line["msg"])
	assert.Equal(t, "GET", line["method"])
	assert.Equal(t, "/hello", line["path"])
	assert.Equal(t, float64(200), line["status"])
	assert.Equal(t, float64(len("world")), line["bytes_out"]) // int64 → JSON number
	assert.NotEmpty(t, line["request_id"], "request_id harus otomatis dari ctx")
}

func TestAccessLog_ClientErrorIsWarn(t *testing.T) {
	var buf bytes.Buffer
	e := echo.New()
	e.Use(AccessLog(newCaptureLogger(&buf)))
	e.GET("/secret", func(c echo.Context) error {
		return echo.NewHTTPError(http.StatusNotFound, "nope")
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/secret", nil)
	e.ServeHTTP(rec, req)

	line := lastLogLine(t, &buf)
	assert.Equal(t, "request rejected", line["msg"])
	assert.Equal(t, float64(404), line["status"])
}

func TestAccessLog_ServerErrorIsError(t *testing.T) {
	var buf bytes.Buffer
	e := echo.New()
	e.Use(AccessLog(newCaptureLogger(&buf)))
	e.GET("/boom", func(c echo.Context) error {
		return context.DeadlineExceeded
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/boom", nil)
	e.ServeHTTP(rec, req)

	line := lastLogLine(t, &buf)
	assert.Equal(t, "request failed", line["msg"])
	assert.Equal(t, float64(500), line["status"])
}

func TestAccessLog_HealthProbeAtDebug(t *testing.T) {
	var buf bytes.Buffer
	e := echo.New()
	e.Use(AccessLog(newCaptureLogger(&buf)))
	e.GET("/healthz", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	e.ServeHTTP(rec, req)

	// JSON handler default level INFO → probe tidak tercatat sama sekali.
	assert.Empty(t, buf.Bytes(), "health probe harus DEBUG, bukan INFO")
}

func TestAccessLog_NilLoggerUsesDefault(t *testing.T) {
	e := echo.New()
	e.Use(AccessLog(nil)) // tidak panic
	e.GET("/ping", func(c echo.Context) error { return c.NoContent(http.StatusNoContent) })

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	e.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
}

// TestAccessLog_UserIDFromAuthContext membuktikan user_id tertangkap saat
// middleware auth sudah mengisi ctx (akses protected endpoint).
func TestAccessLog_UserIDFromAuthContext(t *testing.T) {
	var buf bytes.Buffer
	e := echo.New()
	e.Use(RequestID())
	e.Use(AccessLog(newCaptureLogger(&buf)))
	e.GET("/me", func(c echo.Context) error {
		// Simulasikan apa yang dilakukan JWTAuthMiddleware.
		ctx := context.WithValue(c.Request().Context(), logger.UserIDKey, int64(42))
		c.SetRequest(c.Request().WithContext(ctx))
		return c.String(http.StatusOK, "ok")
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("X-Request-Id", "req-1")
	e.ServeHTTP(rec, req)

	line := lastLogLine(t, &buf)
	assert.Equal(t, float64(42), line["user_id"])
	assert.Equal(t, "req-1", line["request_id"]) // dari ctx juga otomatis
}
