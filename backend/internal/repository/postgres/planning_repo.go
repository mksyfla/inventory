package postgres

import (
	"context"
	"fmt"
	"time"

	"inventory/internal/domain/planning"

	"github.com/jackc/pgx/v5/pgtype"
)

// PostgresPlanningRepository implements planning.Repository for Fase 9 jobs.
// Unlike the sqlc-backed repositories, these queries are job-specific DDL /
// aggregation statements kept inline (running `sqlc generate` for them would
// require a live database), so every method talks to DBTX directly and honors
// an active transaction in ctx via GetTx.
type PostgresPlanningRepository struct {
	db DBTX
}

// NewPostgresPlanningRepository wires the planning repository on a pool or
// transaction-scoped DBTX.
func NewPostgresPlanningRepository(db DBTX) planning.Repository {
	return &PostgresPlanningRepository{db: db}
}

// dbx returns the active transaction if one is present in ctx, otherwise the
// underlying pool.
func (r *PostgresPlanningRepository) dbx(ctx context.Context) DBTX {
	if tx := GetTx(ctx); tx != nil {
		return tx
	}
	return r.db
}

// numeric scans a pgtype.Numeric row value into float64.
func numeric(v pgtype.Numeric, err error, what string) (float64, error) {
	if err != nil {
		return 0, err
	}
	f, err := v.Float64Value()
	if err != nil {
		return 0, fmt.Errorf("postgres: bad numeric %s: %w", what, err)
	}
	return f.Float64, nil
}

// ─── 9.2 expiry.alert ──────────────────────────────────────────────────────────

// GetExpiryCandidates returns all batches with an expiry date inside the
// H-90 alert window (including already-expired ones) together with their
// currently available sellable stock.
func (r *PostgresPlanningRepository) GetExpiryCandidates(ctx context.Context) ([]planning.ExpiryCandidate, error) {
	const q = `
		SELECT b.id, b.item_id, b.batch_no, i.sku, i.name, b.expiry_date,
		       COALESCE((
		           SELECT SUM(sb.qty_onhand)
		           FROM inv.stock_balances sb
		           WHERE sb.batch_id = b.id AND sb.status = 'available'
		       ), 0) AS qty_onhand
		FROM master.batches b
		JOIN master.items i ON i.id = b.item_id
		WHERE b.expiry_date IS NOT NULL
		  AND b.expiry_date <= CURRENT_DATE + 90
		ORDER BY b.expiry_date, b.id`

	rows, err := r.dbx(ctx).Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("postgres: list expiry candidates: %w", err)
	}
	defer rows.Close()

	var list []planning.ExpiryCandidate
	for rows.Next() {
		var c planning.ExpiryCandidate
		var expiry pgtype.Date
		var qty pgtype.Numeric
		if err := rows.Scan(&c.BatchID, &c.ItemID, &c.BatchNo, &c.SKU, &c.ItemName, &expiry, &qty); err != nil {
			return nil, fmt.Errorf("postgres: scan expiry candidate: %w", err)
		}
		c.ExpiryDate = expiry.Time
		if c.QtyOnhand, err = numeric(qty, nil, "expiry qty"); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterate expiry candidates: %w", err)
	}
	return list, nil
}

// MarkBatchQuarantined atomically moves all `available` stock of a batch to
// `quarantine`. A data-modifying CTE inserts the quarantine balance first
// (merging with any existing quarantine row via ON CONFLICT) and deletes the
// available rows in the same statement, so the unique balance key is never
// violated.
func (r *PostgresPlanningRepository) MarkBatchQuarantined(ctx context.Context, batchID int64) error {
	const q = `
		WITH moved AS (
		    INSERT INTO inv.stock_balances
		        (item_id, location_id, batch_id, status, qty_onhand, qty_reserved)
		    SELECT item_id, location_id, batch_id, 'quarantine'::inv.stock_status,
		           qty_onhand, qty_reserved
		    FROM inv.stock_balances
		    WHERE batch_id = $1 AND status = 'available'
		    ON CONFLICT (item_id, location_id, COALESCE(batch_id, 0), status) DO UPDATE
		    SET qty_onhand   = inv.stock_balances.qty_onhand + EXCLUDED.qty_onhand,
		        qty_reserved = inv.stock_balances.qty_reserved + EXCLUDED.qty_reserved
		    RETURNING id
		)
		DELETE FROM inv.stock_balances
		WHERE batch_id = $1 AND status = 'available'`

	if _, err := r.dbx(ctx).Exec(ctx, q, batchID); err != nil {
		return fmt.Errorf("postgres: mark batch %d quarantined: %w", batchID, err)
	}
	return nil
}

// ─── 9.3 reorder.calc (FR-8.2) ─────────────────────────────────────────────────

// GetReorderItems returns every active item with its 90-day outflow average
// (issue + transfer_out movements), reorder inputs and current available qty.
func (r *PostgresPlanningRepository) GetReorderItems(ctx context.Context, since time.Time) ([]planning.ReorderItem, error) {
	const q = `
		WITH outflow AS (
		    SELECT item_id, SUM(qty) AS total_out
		    FROM inv.stock_movements
		    WHERE moved_at >= $1 AND qty < 0
		      AND movement_type IN ('issue', 'transfer_out')
		    GROUP BY item_id
		), onhand AS (
		    SELECT item_id, SUM(qty_onhand) AS qty_available
		    FROM inv.stock_balances
		    WHERE status = 'available'
		    GROUP BY item_id
		)
		SELECT i.id, i.sku, i.name, i.lead_time_days, i.safety_stock,
		       ABS(COALESCE(o.total_out, 0)) / 90.0 AS avg_daily_usage,
		       COALESCE(h.qty_available, 0) AS qty_available
		FROM master.items i
		LEFT JOIN outflow o ON o.item_id = i.id
		LEFT JOIN onhand  h ON h.item_id = i.id
		WHERE i.is_active = TRUE
		ORDER BY i.id`

	rows, err := r.dbx(ctx).Query(ctx, q, since)
	if err != nil {
		return nil, fmt.Errorf("postgres: list reorder items: %w", err)
	}
	defer rows.Close()

	var list []planning.ReorderItem
	for rows.Next() {
		var it planning.ReorderItem
		var usage, avail pgtype.Numeric
		if err := rows.Scan(&it.ItemID, &it.SKU, &it.Name, &it.LeadTimeDays, &it.SafetyStock, &usage, &avail); err != nil {
			return nil, fmt.Errorf("postgres: scan reorder item: %w", err)
		}
		if it.AvgDailyUsage, err = numeric(usage, nil, "avg usage"); err != nil {
			return nil, err
		}
		if it.QtyAvailable, err = numeric(avail, nil, "qty available"); err != nil {
			return nil, err
		}
		list = append(list, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterate reorder items: %w", err)
	}
	return list, nil
}

// UpsertReplenishmentSuggestion inserts or updates one suggestion row per
// item (UNIQUE item_id), stamping notified_at only when (re)notifying.
func (r *PostgresPlanningRepository) UpsertReplenishmentSuggestion(ctx context.Context, s *planning.ReorderSuggestion) error {
	const q = `
		INSERT INTO inv.replenishment_suggestions
		    (item_id, avg_daily_usage, lead_time_days, safety_stock, rop,
		     qty_available, suggested_qty, status, notified_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
		        CASE WHEN $8 = 'notified' THEN now() ELSE NULL END, now())
		ON CONFLICT (item_id) DO UPDATE SET
		    avg_daily_usage = EXCLUDED.avg_daily_usage,
		    lead_time_days  = EXCLUDED.lead_time_days,
		    safety_stock    = EXCLUDED.safety_stock,
		    rop             = EXCLUDED.rop,
		    qty_available   = EXCLUDED.qty_available,
		    suggested_qty   = EXCLUDED.suggested_qty,
		    status          = EXCLUDED.status,
		    notified_at     = CASE WHEN EXCLUDED.status = 'notified'
		                          THEN now() ELSE replenishment_suggestions.notified_at END,
		    updated_at      = now()`

	var usage, safety, rop, avail, sug pgtype.Numeric
	_ = usage.Scan(fmt.Sprintf("%f", s.AvgDailyUsage))
	_ = safety.Scan(fmt.Sprintf("%f", s.SafetyStock))
	_ = rop.Scan(fmt.Sprintf("%f", s.ROP))
	_ = avail.Scan(fmt.Sprintf("%f", s.QtyAvailable))
	_ = sug.Scan(fmt.Sprintf("%f", s.SuggestedQty))

	_, err := r.dbx(ctx).Exec(ctx, q,
		s.ItemID, usage, int16(s.LeadTimeDays), safety, rop, avail, sug, s.Status)
	if err != nil {
		return fmt.Errorf("postgres: upsert replenishment suggestion item %d: %w", s.ItemID, err)
	}
	return nil
}

// ─── 9.4 ledger.reconcile (§4.7) ───────────────────────────────────────────────

// GetBalanceTotals returns qty_onhand per balance key.
func (r *PostgresPlanningRepository) GetBalanceTotals(ctx context.Context) ([]planning.BalanceTotal, error) {
	const q = `
		SELECT b.item_id, b.location_id, COALESCE(b.batch_id, 0),
		       b.status, b.qty_onhand
		FROM inv.stock_balances b
		ORDER BY b.item_id, b.location_id, COALESCE(b.batch_id, 0), b.status`
	return r.scanBalanceTotals(ctx, q, "onhand")
}

// GetLedgerTotals returns SUM(qty) per balance key from the append-only
// stock_movements ledger.
func (r *PostgresPlanningRepository) GetLedgerTotals(ctx context.Context) ([]planning.BalanceTotal, error) {
	const q = `
		SELECT m.item_id, m.location_id, COALESCE(m.batch_id, 0),
		       m.status, SUM(m.qty) AS ledger_sum
		FROM inv.stock_movements m
		GROUP BY m.item_id, m.location_id, m.batch_id, m.status
		ORDER BY m.item_id, m.location_id, m.batch_id, m.status`
	return r.scanBalanceTotals(ctx, q, "ledger")
}

func (r *PostgresPlanningRepository) scanBalanceTotals(ctx context.Context, query, source string) ([]planning.BalanceTotal, error) {
	rows, err := r.dbx(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("postgres: list %s totals: %w", source, err)
	}
	defer rows.Close()

	var list []planning.BalanceTotal
	for rows.Next() {
		var t planning.BalanceTotal
		var batchID int64
		var val pgtype.Numeric
		if err := rows.Scan(&t.ItemID, &t.LocationID, &batchID, &t.Status, &val); err != nil {
			return nil, fmt.Errorf("postgres: scan %s total: %w", source, err)
		}
		if batchID != 0 {
			id := batchID
			t.BatchID = &id
		}
		if source == "ledger" {
			if t.LedgerSum, err = numeric(val, nil, source+" sum"); err != nil {
				return nil, err
			}
		} else if t.QtyOnhand, err = numeric(val, nil, source); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterate %s totals: %w", source, err)
	}
	return list, nil
}

// ─── 9.5 partition.maintain & report.refresh ───────────────────────────────────

// CreatePartition creates the monthly range partition for the given spec.
// CREATE TABLE IF NOT EXISTS keeps the job idempotent across re-runs.
func (r *PostgresPlanningRepository) CreatePartition(ctx context.Context, spec planning.PartitionSpec) error {
	const tmpl = `CREATE TABLE IF NOT EXISTS inv.%s PARTITION OF inv.stock_movements
		FOR VALUES FROM ('%s') TO ('%s')`
	sql := fmt.Sprintf(tmpl, spec.Name, spec.Start.Format("2006-01-02"), spec.End.Format("2006-01-02"))
	if _, err := r.dbx(ctx).Exec(ctx, sql); err != nil {
		return fmt.Errorf("postgres: create partition %s: %w", spec.Name, err)
	}
	return nil
}

// RefreshMaterializedViews refreshes each named materialized view
// concurrently (the views carry unique indexes for this).
func (r *PostgresPlanningRepository) RefreshMaterializedViews(ctx context.Context, names []string) error {
	for _, name := range names {
		if _, err := r.dbx(ctx).Exec(ctx, "REFRESH MATERIALIZED VIEW CONCURRENTLY "+name); err != nil {
			return fmt.Errorf("postgres: refresh materialized view %s: %w", name, err)
		}
	}
	return nil
}

// ─── 9.1 job-run audit trail ───────────────────────────────────────────────────

// StartJobRun records the beginning of a run and returns its id.
func (r *PostgresPlanningRepository) StartJobRun(ctx context.Context, name planning.JobName) (int64, error) {
	var id int64
	err := r.dbx(ctx).QueryRow(ctx,
		`INSERT INTO aud.job_runs (job_name) VALUES ($1) RETURNING id`, name).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres: start job run %s: %w", name, err)
	}
	return id, nil
}

// FinishJobRun closes a run with its terminal status and outcome.
func (r *PostgresPlanningRepository) FinishJobRun(ctx context.Context, id int64, res planning.JobRunResult) error {
	if _, err := r.dbx(ctx).Exec(ctx,
		`UPDATE aud.job_runs SET finished_at = now(), status = $2,
		        items_processed = $3, detail = $4
		 WHERE id = $1`, id, res.Status, res.ItemsProcessed, res.Detail); err != nil {
		return fmt.Errorf("postgres: finish job run %d: %w", id, err)
	}
	return nil
}
