package main

import (
	"fmt"
	"log/slog"
	"os"

	"inventory/internal/config"
	"inventory/internal/pkg/logger"
	"inventory/internal/worker"

	"github.com/hibiken/asynq"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	log := logger.Init(cfg.AppEnv)
	log.Info("Starting SIMBAR background worker...", slog.String("env", cfg.AppEnv))

	srv := asynq.NewServer(
		asynq.RedisClientOpt{Addr: cfg.RedisAddr},
		asynq.Config{
			Concurrency: 10,
			Queues:      map[string]int{"default": 10, "critical": 5},
		},
	)

	mux := worker.NewServeMux()

	log.Info("Worker listening for background tasks via Redis", slog.String("redis", cfg.RedisAddr))
	if err := srv.Run(mux); err != nil {
		log.Error("Worker server stopped", slog.Any("error", err))
		os.Exit(1)
	}
}
