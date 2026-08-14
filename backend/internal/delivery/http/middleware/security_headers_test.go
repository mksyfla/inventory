package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func runSecurityHeaders(t *testing.T, env string, path string, proto string) *httptest.ResponseRecorder {
	t.Helper()
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if proto != "" {
		req.Header.Set("X-Forwarded-Proto", proto)
	}
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := SecurityHeaders(env)(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	err := handler(c)
	require.NoError(t, err)
	return rec
}

func TestSecurityHeaders_NoHSTSInDevelopment(t *testing.T) {
	rec := runSecurityHeaders(t, "development", "/api/v1/ping", "")
	assert.Empty(t, rec.Header().Get("Strict-Transport-Security"))
}

func TestSecurityHeaders_HSTSInProduction(t *testing.T) {
	rec := runSecurityHeaders(t, "production", "/api/v1/ping", "")
	assert.Equal(t, "max-age=31536000; includeSubDomains", rec.Header().Get("Strict-Transport-Security"))
}

func TestSecurityHeaders_HSTSBehindTLSProxy(t *testing.T) {
	rec := runSecurityHeaders(t, "development", "/api/v1/ping", "https")
	assert.NotEmpty(t, rec.Header().Get("Strict-Transport-Security"))
}

func TestSecurityHeaders_HardeningHeadersPresent(t *testing.T) {
	rec := runSecurityHeaders(t, "development", "/api/v1/ping", "")
	assert.Equal(t, "camera=(), microphone=(), geolocation=()", rec.Header().Get("Permissions-Policy"))
	assert.Equal(t, "same-origin", rec.Header().Get("Cross-Origin-Opener-Policy"))
	assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	assert.NotEmpty(t, rec.Header().Get("Content-Security-Policy"))
}

func TestSecurityHeaders_SwaggerPathsCacheable(t *testing.T) {
	rec := runSecurityHeaders(t, "development", "/swagger/", "")
	assert.NotEqual(t, "no-store", rec.Header().Get("Cache-Control"))
	assert.Contains(t, rec.Header().Get("Content-Security-Policy"), "unsafe-inline")
}
