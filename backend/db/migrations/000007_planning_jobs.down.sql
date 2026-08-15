-- Fase 9 rollback
DROP MATERIALIZED VIEW IF EXISTS inv.mv_monthly_movements;
DROP TABLE IF EXISTS aud.job_runs;
DROP TABLE IF EXISTS inv.replenishment_suggestions;
