package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"inventory/internal/config"
	httpDelivery "inventory/internal/delivery/http"
	"inventory/internal/pkg/auth"
	"inventory/internal/pkg/logger"
	redisclient "inventory/internal/pkg/redis"
	"inventory/internal/repository/postgres"
	itemuc "inventory/internal/usecase/item"
	stockuc "inventory/internal/usecase/stock"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	// 1. Load config
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// 2. Init structured logger
	log := logger.Init(cfg.AppEnv)
	log.Info("Configuration loaded successfully",
		slog.String("env", cfg.AppEnv),
		slog.String("port", cfg.Port),
	)

	if cfg.JWTSecret == "super-secret-key" {
		log.Warn("using default JWT secret — set JWT_SECRET before any non-development deployment")
	}

	ctx := context.Background()

	// 3. Init Redis store
	store := redisclient.New(cfg.RedisAddr)

	// 4. Init PostgreSQL connection pool and sqlc queries
	pool, err := pgxpool.New(ctx, cfg.DBConnString)
	if err != nil {
		log.Error("failed to create database pool", slog.Any("error", err))
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Error("failed to connect to database", slog.Any("error", err))
		os.Exit(1)
	}

	queries := postgres.New(pool)

	// 5. Wire authentication user lookups (Fase 2)
	// Login looks users up by username; the refresh flow looks them up by numeric user ID
	// (claims.Subject). These are separate on purpose: usernames may themselves be numeric
	// (e.g. NIP), so guessing by ParseInt would resolve them to the wrong lookup.
	userRolesAndWarehouses := func(ctx context.Context, userID int64) ([]string, []string, error) {
		roles, err := queries.ListUserRoleCodes(ctx, userID)
		if err != nil {
			return nil, nil, err
		}
		warehouses, err := queries.ListUserWarehouseCodes(ctx, userID)
		if err != nil {
			return nil, nil, err
		}
		return roles, warehouses, nil
	}

	lookupUserByUsername := func(ctx context.Context, username string) (int64, string, []string, []string, error) {
		user, err := queries.GetUserByUsername(ctx, username)
		if err != nil {
			return 0, "", nil, nil, err
		}
		if !user.IsActive {
			return 0, "", nil, nil, errors.New("user is deactivated")
		}
		roles, warehouses, err := userRolesAndWarehouses(ctx, user.ID)
		if err != nil {
			return 0, "", nil, nil, err
		}
		return user.ID, user.PasswordHash, roles, warehouses, nil
	}

	lookupUserByID := func(ctx context.Context, userID int64) (string, []string, []string, error) {
		user, err := queries.GetUserByID(ctx, userID)
		if err != nil {
			return "", nil, nil, err
		}
		if !user.IsActive {
			return "", nil, nil, errors.New("user is deactivated")
		}
		roles, warehouses, err := userRolesAndWarehouses(ctx, user.ID)
		if err != nil {
			return "", nil, nil, err
		}
		return user.Username, roles, warehouses, nil
	}

	// 6. Wire user registration (Fase 2.1)
	createUser := func(ctx context.Context, username, email, fullName, passwordHash string) (int64, error) {
		row, err := queries.CreateUser(ctx, postgres.CreateUserParams{
			Username:     username,
			Email:        pgtype.Text{String: email, Valid: true},
			FullName:     fullName,
			PasswordHash: passwordHash,
			IsActive:     true,
		})
		if err != nil {
			return 0, err
		}
		return row.ID, nil
	}

	// 6b. Build Casbin enforcer and load RBAC policies from the database (Fase 2.4)
	enforcer, err := auth.NewEnforcer("")
	if err != nil {
		log.Error("failed to create casbin enforcer", slog.Any("error", err))
		os.Exit(1)
	}

	rolePermRows, err := queries.ListRolePermissions(ctx)
	if err != nil {
		log.Error("failed to load role permissions", slog.Any("error", err))
		os.Exit(1)
	}
	warehouses, err := queries.ListWarehouseCodes(ctx)
	if err != nil {
		log.Error("failed to load warehouse codes", slog.Any("error", err))
		os.Exit(1)
	}

	rolePerms := make([]auth.RolePermission, 0, len(rolePermRows))
	for _, row := range rolePermRows {
		rolePerms = append(rolePerms, auth.RolePermission{
			RoleCode:       row.RoleCode.String,
			PermissionCode: row.PermissionCode.String,
		})
	}
	policies := auth.BuildPolicies(rolePerms, warehouses)
	for _, p := range policies {
		if _, err := enforcer.AddPolicy(p[0], p[1], p[2], p[3]); err != nil {
			log.Error("failed to add casbin policy", slog.Any("error", err), slog.Any("policy", p))
			os.Exit(1)
		}
	}
	log.Info("RBAC policies loaded",
		slog.Int("count", len(policies)),
		slog.Int("warehouses", len(warehouses)),
	)

	// 7. Init domain usecases (Fase 3)
	itemUsecase := itemuc.NewUsecase(queries)
	stockUsecase := stockuc.NewPostingUsecase(
		postgres.NewPostgresStockRepository(pool),
		postgres.NewPostgresTxRunner(pool),
	)

	// 8. Init asynq client for async jobs (Fase 3.4)
	asynqClient := asynq.NewClient(asynq.RedisClientOpt{Addr: cfg.RedisAddr})
	defer asynqClient.Close()

	// 9. Init router with all dependencies
	router := httpDelivery.NewRouter(httpDelivery.RouterConfig{
		JWTSecret:      cfg.JWTSecret,
		AppEnv:         cfg.AppEnv,
		Enforcer:       enforcer,
		Store:          store,
		LookupUser:     lookupUserByUsername,
		LookupUserByID: lookupUserByID,
		CreateUser:     createUser,
		ItemUsecase:    itemUsecase,
		StockUsecase:   stockUsecase,
		AsynqClient:    asynqClient,
	})

	// 10. Start HTTP Server with hardened timeouts and header limits
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadTimeout:       10 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MiB
	}
	log.Info("Starting HTTP API Server...", slog.String("addr", srv.Addr))
	if err := router.StartServer(srv); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("API server stopped", slog.Any("error", err))
		os.Exit(1)
	}
}
