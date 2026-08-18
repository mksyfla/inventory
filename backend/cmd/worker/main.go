package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"inventory/internal/config"
	"inventory/internal/pkg/logger"
	"inventory/internal/repository/postgres"
	planninguc "inventory/internal/usecase/planning"
	"inventory/internal/worker"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
)

// newPlanningUsecase connects to PostgreSQL and wires the Fase 9 planning
// usecase (expiry.alert, reorder.calc, ledger.reconcile, partition.maintain,
// report.refresh).
func newPlanningUsecase(ctx context.Context, cfg *config.Config) (*planninguc.Usecase, error) {
	pool, err := pgxpool.New(ctx, cfg.DBConnString)
	if err != nil {
		return nil, fmt.Errorf("worker: connect database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("worker: ping database: %w", err)
	}

	repo := postgres.NewPostgresPlanningRepository(pool)
	return planninguc.New(repo, nil, planninguc.Config{}), nil
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	log := logger.Init(cfg.AppEnv)
	log.Info("Starting SIMBAR background worker...", slog.String("env", cfg.AppEnv))

	ctx := context.Background()

	// Fase 9: planning usecase (jobs 9.2 - 9.5).
	planningUC, err := newPlanningUsecase(ctx, cfg)
	if err != nil {
		log.Error("Failed to initialize planning usecase", slog.Any("error", err))
		os.Exit(1)
	}

	srv := asynq.NewServer(
		asynq.RedisClientOpt{Addr: cfg.RedisAddr},
		asynq.Config{
			Concurrency: 10,
			Queues:      map[string]int{"default": 10, "critical": 5},
		},
	)

	// Fase 9.1: penjadwalan berkala (cron) per FSD §8.
	scheduler := asynq.NewScheduler(
		asynq.RedisClientOpt{Addr: cfg.RedisAddr},
		&asynq.SchedulerOpts{Location: nil}, // timezone lokal server
	)
	registerCronJobs(scheduler)

	mux := worker.NewServeMux(worker.ServeMuxDeps{Planning: planningUC})

	if err := scheduler.Start(); err != nil {
		log.Error("Failed to start scheduler", slog.Any("error", err))
		os.Exit(1)
	}
	defer scheduler.Shutdown()

	log.Info("Worker listening for background tasks via Redis", slog.String("redis", cfg.RedisAddr))
	if err := srv.Run(mux); err != nil {
		log.Error("Worker server stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

// registerCronJobs schedules the Fase 9 jobs on their FSD §8 cron slots:
//
//	expiry.alert       harian 06:00
//	reorder.calc       harian 01:00
//	report.refresh     harian 02:00
//	ledger.reconcile   mingguan (Senin 03:00)
//	partition.maintain bulanan (tanggal 1, 04:15)
func registerCronJobs(scheduler *asynq.Scheduler) {
	jobs := []struct {
		cron string
		typ  string
	}{
		{"0 6 * * *", worker.TypeExpiryAlert},
		{"0 1 * * *", worker.TypeReorderCalc},
		{"0 2 * * *", worker.TypeReportRefresh},
		{"0 3 * * 1", worker.TypeLedgerReconcile},
		{"15 4 1 * *", worker.TypePartitionMaintain},
	}
	for _, j := range jobs {
		entry, err := scheduler.Register(j.cron, asynq.NewTask(j.typ, nil))
		if err != nil {
			logger.Error(context.Background(), "Failed to register cron job", slog.String("job", j.typ), slog.Any("error", err))
			continue
		}
		logger.Info(context.Background(), "Registered cron job", slog.String("job", j.typ),
			slog.String("cron", j.cron), slog.String("entry", entry))
	}
}
