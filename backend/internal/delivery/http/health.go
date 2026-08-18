package http

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// HealthChecker reports whether a single dependency is reachable.
// The check runs with its own timeout so a hung dependency cannot block
// the /readyz response forever.
type HealthChecker struct {
	Name  string
	Check func(ctx context.Context) error
}

// healthHandler serves liveness (/healthz) and readiness (/readyz) probes
// (FSD 10.5). /healthz always answers 200 — the process is alive. /readyz
// pings every configured dependency (PostgreSQL, Redis) in parallel and
// returns 503 when any of them fails.
type healthHandler struct {
	checkers []HealthChecker
	timeout  time.Duration
}

func newHealthHandler(checkers []HealthChecker) *healthHandler {
	if len(checkers) == 0 {
		checkers = nil
	}
	return &healthHandler{checkers: checkers, timeout: 2 * time.Second}
}

// liveness — the process is up; no dependency probing.
func (h *healthHandler) liveness(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"status": "ok",
	})
}

// readiness — every configured dependency must pass.
func (h *healthHandler) readiness(c echo.Context) error {
	type checkResult struct {
		name string
		err  error
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), h.timeout)
	defer cancel()

	results := make(chan checkResult, len(h.checkers))
	var wg sync.WaitGroup
	for _, chk := range h.checkers {
		wg.Add(1)
		go func(chk HealthChecker) {
			defer wg.Done()
			results <- checkResult{name: chk.Name, err: chk.Check(ctx)}
		}(chk)
	}
	wg.Wait()
	close(results)

	checks := make(map[string]string, len(h.checkers))
	allOK := true
	for r := range results {
		if r.err != nil {
			checks[r.name] = "down: " + r.err.Error()
			allOK = false
		} else {
			checks[r.name] = "up"
		}
	}

	if !allOK {
		return c.JSON(http.StatusServiceUnavailable, map[string]any{
			"status": "unavailable",
			"checks": checks,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"status": "ready",
		"checks": checks,
	})
}
