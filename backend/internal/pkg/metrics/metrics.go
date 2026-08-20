// Package metrics exposes Prometheus instrumentation for the SIMBAR API
// (FSD 10.5): request latency (p95 via summary objectives), request counts,
// database pool occupancy and asynq queue depth. Each Metrics instance owns
// its own registry so unit tests never pollute a global one.
package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics bundles the collectors registered on a private registry.
type Metrics struct {
	registry *prometheus.Registry

	httpRequests *prometheus.CounterVec
	httpLatency  *prometheus.SummaryVec
	httpInflight prometheus.Gauge
}

// QueueDepthStat is one asynq queue snapshot, produced by the caller
// (e.g. via asynq.Inspector) at scrape time.
type QueueDepthStat struct {
	Queue    string
	Pending  int64
	Active   int64
	Archived int64
}

// DBPoolStats is a pgxpool occupancy snapshot (subset of pgxpool.Stat).
type DBPoolStats struct {
	MaxConns      int32
	TotalConns    int32 // acquired from the pool (in use + idle)
	IdleConns     int32
	AcquiredConns int32 // currently in use
}

// New creates a Metrics with its own registry.
func New() *Metrics {
	m := &Metrics{
		registry: prometheus.NewRegistry(),

		httpRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total HTTP requests processed, by method, route and status class.",
		}, []string{"method", "path", "status"}),
		httpLatency: prometheus.NewSummaryVec(prometheus.SummaryOpts{
			Name:       "http_request_duration_seconds",
			Help:       "HTTP request latency in seconds. p95 is exposed via the summary objective.",
			Objectives: map[float64]float64{0.5: 0.05, 0.9: 0.01, 0.95: 0.005, 0.99: 0.001},
		}, []string{"method", "path"}),
		httpInflight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "http_requests_in_flight",
			Help: "Number of HTTP requests currently being served.",
		}),
	}

	m.registry.MustRegister(m.httpRequests, m.httpLatency, m.httpInflight)

	m.registry.MustRegister(newDBPoolCollector(nil))
	m.registry.MustRegister(newQueueDepthCollector(nil))

	return m
}

// Middleware returns an Echo middleware that records duration and status for
// every request. The route pattern (e.g. /api/v1/items/:id) is used as the
// path label to keep cardinality bounded.
func (m *Metrics) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			m.httpInflight.Inc()

			err := next(c)

			m.httpInflight.Dec()
			status := c.Response().Status
			if err != nil {
				// Errors are written by the HTTPErrorHandler after the chain
				// returns, so the response status is not set yet — map the
				// error back to its code (404, 422, 500, ...).
				status = http.StatusInternalServerError
				if he, ok := err.(*echo.HTTPError); ok {
					status = he.Code
				}
			}
			if status == 0 {
				status = http.StatusOK
			}
			path := c.Path()
			if path == "" {
				path = "unmatched"
			}
			m.httpRequests.WithLabelValues(c.Request().Method, path, strconv.Itoa(status)).Inc()
			m.httpLatency.WithLabelValues(c.Request().Method, path).Observe(time.Since(start).Seconds())
			return err
		}
	}
}

// Handler returns the Prometheus scrape endpoint (text exposition format).
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

// RegisterDBPool wires a function that returns the current pgxpool stats.
// Pass nil to reset to no-ops (default for tests).
func (m *Metrics) RegisterDBPool(fn func() DBPoolStats) {
	m.registry.Unregister(newDBPoolCollector(nil))
	m.registry.MustRegister(newDBPoolCollector(fn))
}

// RegisterQueueDepth wires a function that returns asynq queue snapshots.
// Pass nil to reset to no-ops (default for tests).
func (m *Metrics) RegisterQueueDepth(fn func() []QueueDepthStat) {
	m.registry.Unregister(newQueueDepthCollector(nil))
	m.registry.MustRegister(newQueueDepthCollector(fn))
}

// ─── DB pool collector ────────────────────────────────────────────────────

type dbPoolCollector struct {
	fn            func() DBPoolStats
	maxConnsDesc  *prometheus.Desc
	totalDesc     *prometheus.Desc
	idleDesc      *prometheus.Desc
	acquiredDesc  *prometheus.Desc
}

func newDBPoolCollector(fn func() DBPoolStats) *dbPoolCollector {
	return &dbPoolCollector{
		fn: fn,
		maxConnsDesc: prometheus.NewDesc("db_pool_max_conns",
			"Maximum configured connections in the pool.", nil, nil),
		totalDesc: prometheus.NewDesc("db_pool_total_conns",
			"Connections acquired from the pool (in use + idle).", nil, nil),
		idleDesc: prometheus.NewDesc("db_pool_idle_conns",
			"Idle connections in the pool.", nil, nil),
		acquiredDesc: prometheus.NewDesc("db_pool_acquired_conns",
			"Connections currently in use.", nil, nil),
	}
}

func (c *dbPoolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.maxConnsDesc
	ch <- c.totalDesc
	ch <- c.idleDesc
	ch <- c.acquiredDesc
}

func (c *dbPoolCollector) Collect(ch chan<- prometheus.Metric) {
	if c.fn == nil {
		return
	}
	s := c.fn()
	ch <- prometheus.MustNewConstMetric(c.maxConnsDesc, prometheus.GaugeValue, float64(s.MaxConns))
	ch <- prometheus.MustNewConstMetric(c.totalDesc, prometheus.GaugeValue, float64(s.TotalConns))
	ch <- prometheus.MustNewConstMetric(c.idleDesc, prometheus.GaugeValue, float64(s.IdleConns))
	ch <- prometheus.MustNewConstMetric(c.acquiredDesc, prometheus.GaugeValue, float64(s.AcquiredConns))
}

// ─── Queue depth collector ────────────────────────────────────────────────

type queueDepthCollector struct {
	fn         func() []QueueDepthStat
	pendingDesc  *prometheus.Desc
	activeDesc   *prometheus.Desc
	archivedDesc *prometheus.Desc
}

func newQueueDepthCollector(fn func() []QueueDepthStat) *queueDepthCollector {
	labels := []string{"queue"}
	return &queueDepthCollector{
		fn: fn,
		pendingDesc: prometheus.NewDesc("asynq_queue_pending",
			"Pending (unprocessed) jobs per asynq queue.", labels, nil),
		activeDesc: prometheus.NewDesc("asynq_queue_active",
			"Active (in-flight) jobs per asynq queue.", labels, nil),
		archivedDesc: prometheus.NewDesc("asynq_queue_archived",
			"Archived (failed) jobs per asynq queue.", labels, nil),
	}
}

func (c *queueDepthCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.pendingDesc
	ch <- c.activeDesc
	ch <- c.archivedDesc
}

func (c *queueDepthCollector) Collect(ch chan<- prometheus.Metric) {
	if c.fn == nil {
		return
	}
	for _, q := range c.fn() {
		ch <- prometheus.MustNewConstMetric(c.pendingDesc, prometheus.GaugeValue, float64(q.Pending), q.Queue)
		ch <- prometheus.MustNewConstMetric(c.activeDesc, prometheus.GaugeValue, float64(q.Active), q.Queue)
		ch <- prometheus.MustNewConstMetric(c.archivedDesc, prometheus.GaugeValue, float64(q.Archived), q.Queue)
	}
}
