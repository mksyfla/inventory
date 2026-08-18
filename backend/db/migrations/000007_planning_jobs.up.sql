-- Fase 9: Background Jobs, Perencanaan Stok (M8) & Penjadwal
--
-- 1. inv.replenishment_suggestions  (9.3 reorder.calc — FR-8.2)
--    Hasil perhitungan ROP per item; satu baris per item (upsert per run).
-- 2. aud.job_runs                    (9.1 — jejak eksekusi job background)
--    Menyimpan hasil tiap run job agar dapat diaudit & diuji.
-- 3. inv.mv_monthly_movements        (9.5 report.refresh — FR-9.x)
--    Materialized view agregasi mutasi bulanan untuk laporan/dashboard.

-- ─── 1. inv.replenishment_suggestions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inv.replenishment_suggestions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id         BIGINT NOT NULL REFERENCES master.items(id),
    avg_daily_usage NUMERIC(18,4) NOT NULL DEFAULT 0,
    lead_time_days  SMALLINT NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
    safety_stock    NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
    rop             NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (rop >= 0),
    qty_available   NUMERIC(18,4) NOT NULL DEFAULT 0,
    suggested_qty   NUMERIC(18,4) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','notified','ordered')),
    notified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ,
    UNIQUE (item_id)
);
CREATE INDEX idx_replenish_status ON inv.replenishment_suggestions (status) WHERE status IN ('pending','notified');

-- ─── 2. aud.job_runs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aud.job_runs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_name        VARCHAR(50) NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','completed','failed')),
    items_processed INT NOT NULL DEFAULT 0,
    detail          TEXT
);
CREATE INDEX idx_job_runs_name ON aud.job_runs (job_name, started_at DESC);

-- ─── 3. inv.mv_monthly_movements (laporan mutasi bulanan, FR-9.x) ──────────────
-- WITH NO DATA: isi di-refresh oleh job report.refresh (9.5) pada 02:00.
CREATE MATERIALIZED VIEW inv.mv_monthly_movements AS
SELECT
    date_trunc('month', moved_at) AS month,
    item_id,
    location_id,
    status,
    movement_type,
    SUM(qty)  AS total_qty,
    COUNT(*)  AS txn_count
FROM inv.stock_movements
GROUP BY 1, 2, 3, 4, 5
WITH NO DATA;
CREATE UNIQUE INDEX uq_mv_monthly_key
    ON inv.mv_monthly_movements (month, item_id, location_id, status, movement_type);
