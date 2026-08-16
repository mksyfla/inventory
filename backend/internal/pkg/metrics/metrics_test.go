package metrics

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// scrape fetches /metrics from the Metrics handler and returns the body.
func scrape(t *testing.T, m *Metrics) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	body, err := io.ReadAll(rec.Body)
	require.NoError(t, err)
	return string(body)
}

func TestMetrics_HandlerExposesPrometheusFormat(t *testing.T) {
	m := New()
	// Observe at least one request so the family HELP/TYPE lines are emitted.
	e := echo.New()
	e.Use(m.Middleware())
	e.GET("/ping", func(c echo.Context) error { return c.String(http.StatusOK, "pong") })
	e.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/ping", nil))

	out := scrape(t, m)

	// Header of the text exposition format: simbar metric types and HELP lines.
	assert.Contains(t, out, "# HELP http_requests_total")
	assert.Contains(t, out, "# TYPE http_requests_total counter")
	assert.Contains(t, out, "# TYPE http_request_duration_seconds summary")
	assert.Contains(t, out, "# TYPE http_requests_in_flight gauge")
}

func TestMetrics_MiddlewareRecordsLatencyAndCount(t *testing.T) {
	m := New()
	e := echo.New()
	e.Use(m.Middleware())
	e.GET("/items/:id", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/items/42", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	out := scrape(t, m)

	// Route pattern (not the concrete :id value) keeps cardinality bounded.
	assert.Contains(t, out, `http_requests_total{method="GET",path="/items/:id",status="200"} 1`)

	// The summary exposes the p95 objective (FSD 10.5: latency p95).
	assert.Contains(t, out, `http_request_duration_seconds{method="GET",path="/items/:id",quantile="0.95"}`)
	assert.Contains(t, out, `http_request_duration_seconds_sum{method="GET",path="/items/:id"}`)
}

func TestMetrics_MiddlewareUnmatchedPath(t *testing.T) {
	m := New()
	e := echo.New()
	e.Use(m.Middleware())
	e.GET("/known", func(c echo.Context) error { return c.NoContent(http.StatusNoContent) })

	// No handler matches → Echo returns 404 with path "unmatched".
	req := httptest.NewRequest(http.MethodGet, "/nope", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)

	out := scrape(t, m)
	assert.Contains(t, out, `path="unmatched"`)
	assert.Contains(t, out, `status="404"`)
}

func TestMetrics_QueueDepthCollector(t *testing.T) {
	m := New()
	m.RegisterQueueDepth(func() []QueueDepthStat {
		return []QueueDepthStat{
			{Queue: "default", Pending: 3, Active: 1, Archived: 2},
			{Queue: "expiry", Pending: 7, Active: 0, Archived: 5},
		}
	})

	out := scrape(t, m)
	assert.Contains(t, out, `asynq_queue_pending{queue="default"} 3`)
	assert.Contains(t, out, `asynq_queue_active{queue="default"} 1`)
	assert.Contains(t, out, `asynq_queue_archived{queue="default"} 2`)
	assert.Contains(t, out, `asynq_queue_pending{queue="expiry"} 7`)
}

func TestMetrics_DBPoolCollector(t *testing.T) {
	m := New()
	m.RegisterDBPool(func() DBPoolStats {
		return DBPoolStats{MaxConns: 10, TotalConns: 4, IdleConns: 2, AcquiredConns: 2}
	})

	out := scrape(t, m)
	assert.Contains(t, out, "db_pool_max_conns 10")
	assert.Contains(t, out, "db_pool_total_conns 4")
	assert.Contains(t, out, "db_pool_idle_conns 2")
	assert.Contains(t, out, "db_pool_acquired_conns 2")
}

func TestMetrics_ReRegisterReplacesSource(t *testing.T) {
	// Registering twice must not panic (duplicate descriptor) — the old
	// collector is unregistered and replaced.
	m := New()
	m.RegisterQueueDepth(func() []QueueDepthStat {
		return []QueueDepthStat{{Queue: "a", Pending: 1}}
	})
	m.RegisterQueueDepth(func() []QueueDepthStat {
		return []QueueDepthStat{{Queue: "b", Pending: 9}}
	})

	out := scrape(t, m)
	assert.Contains(t, out, `asynq_queue_pending{queue="b"} 9`)
	assert.False(t, strings.Contains(out, `queue="a"`))
}
