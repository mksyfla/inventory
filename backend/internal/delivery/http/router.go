package http

import (
	"net/http"

	"inventory/internal/delivery/http/handler"
	"inventory/internal/delivery/http/middleware"
	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/metrics"
	redisclient "inventory/internal/pkg/redis"
	"inventory/internal/pkg/validation"
	inbounduc "inventory/internal/usecase/inbound"
	itemuc "inventory/internal/usecase/item"
	outbounduc "inventory/internal/usecase/outbound"
	stockuc "inventory/internal/usecase/stock"
	countinguc "inventory/internal/usecase/counting"
	transferuc "inventory/internal/usecase/transfer"

	"github.com/casbin/casbin/v2"
	"github.com/hibiken/asynq"
	"github.com/labstack/echo/v4"
	echoMiddleware "github.com/labstack/echo/v4/middleware"
)

// RouterConfig holds dependencies required to configure the Echo router.
type RouterConfig struct {
	JWTSecret       string
	AppEnv          string
	Enforcer        *casbin.Enforcer
	Store           redisclient.KVStore
	LookupUser      handler.UserLookup
	LookupUserByID  handler.UserLookupByID
	ItemUsecase     *itemuc.Usecase
	StockUsecase    *stockuc.PostingUsecase
	ReceiptUsecase  *inbounduc.ReceiptUsecase
	OutboundUsecase *outbounduc.OutboundUsecase
	TransferUsecase *transferuc.TransferUsecase
	CountingUsecase *countinguc.CountingUsecase
	AsynqClient     *asynq.Client
	CreateUser      handler.CreateUserFunc

	// Observability (FSD 10.5) — all optional; omitted in unit tests.
	Metrics        *metrics.Metrics
	HealthCheckers []HealthChecker
}

// NewRouter initializes an Echo instance, registers global middlewares, and configures route mapping.
func NewRouter(cfg ...RouterConfig) *echo.Echo {
	e := echo.New()

	// Register custom global error handler
	e.HTTPErrorHandler = middleware.HTTPErrorHandler

	// Wire input validation (go-playground/validator per FSD)
	e.Validator = validation.New()

	// Register global middlewares
	e.Use(echoMiddleware.Recover())
	e.Use(middleware.RequestID())
	if len(cfg) > 0 {
		e.Use(middleware.SecurityHeaders(cfg[0].AppEnv))
	} else {
		e.Use(middleware.SecurityHeaders(""))
	}

	// ─── Observability (FSD 10.5) ───────────────────────────────────────
	// Prometheus metrics middleware runs before everything else so latency
	// covers the full middleware chain.
	if len(cfg) > 0 && cfg[0].Metrics != nil {
		e.Use(cfg[0].Metrics.Middleware())
		e.GET("/metrics", echo.WrapHandler(cfg[0].Metrics.Handler()))
	}

	// Health probes (public, k8s-style): /healthz liveness, /readyz
	// readiness with per-dependency checks (PostgreSQL, Redis).
	health := newHealthHandler(nil)
	if len(cfg) > 0 {
		health = newHealthHandler(cfg[0].HealthCheckers)
	}
	e.GET("/healthz", health.liveness)
	e.GET("/readyz", health.readiness)

	// Configure base API v1 path
	v1 := e.Group("/api/v1")

	// ─── Public endpoints ──────────────────────────────────────────────
	v1.GET("/ping", func(c echo.Context) error {
		return response.Success(c, http.StatusOK, "pong", nil)
	})

	// ─── Auth endpoints (require optional config) ──────────────────────
	if len(cfg) > 0 && cfg[0].JWTSecret != "" {
		c := cfg[0]

		store := c.Store
		if store == nil {
			store = redisclient.NewInMemoryStore()
		}

		authHandler := handler.NewAuthHandler(c.JWTSecret, store, c.LookupUser, c.LookupUserByID, c.CreateUser)

		auth := v1.Group("/auth")
		auth.POST("/login", authHandler.Login, middleware.LoginRateLimiter(store), echoMiddleware.BodyLimit("1M"))
		auth.POST("/register", authHandler.Register, middleware.RegisterRateLimiter(store), echoMiddleware.BodyLimit("1M"))
		auth.POST("/refresh", authHandler.Refresh, echoMiddleware.BodyLimit("1M"))
		auth.POST("/logout", authHandler.Logout, echoMiddleware.BodyLimit("1M"))

		// ─── Protected endpoints (JWT + rate limit) ─────────────────────
		protected := v1.Group("", middleware.JWTAuthMiddleware(c.JWTSecret))
		protected.Use(middleware.UserRateLimiter(store))

		// ─── Master Data endpoints (Phase 3) ────────────────────────────
		if c.ItemUsecase != nil {
			itemHandler := handler.NewItemHandler(c.ItemUsecase, c.AsynqClient)

			// Items
			protected.GET("/items", itemHandler.ListItems, rbacMW(c, "item", "read")...)
			protected.POST("/items", itemHandler.CreateItem, append(rbacMW(c, "item", "write"), echoMiddleware.BodyLimit("1M"))...)
			protected.PUT("/items/:id", itemHandler.UpdateItem, append(rbacMW(c, "item", "write"), echoMiddleware.BodyLimit("1M"))...)
			protected.GET("/items/:id", itemHandler.GetItem, rbacMW(c, "item", "read")...)
			protected.DELETE("/items/:id", itemHandler.SoftDeleteItem, rbacMW(c, "item", "write")...)
			protected.POST("/items/import", itemHandler.ImportItems, append(rbacMW(c, "item", "import"), echoMiddleware.BodyLimit("10M"))...)

			// Locations
			protected.GET("/locations", itemHandler.ListLocations, rbacMW(c, "location", "read")...)
			protected.POST("/locations", itemHandler.CreateLocation, append(rbacMW(c, "location", "write"), echoMiddleware.BodyLimit("1M"))...)

			// Partners
			protected.GET("/partners", itemHandler.ListPartners, rbacMW(c, "partner", "read")...)
			protected.POST("/partners", itemHandler.CreatePartner, append(rbacMW(c, "partner", "write"), echoMiddleware.BodyLimit("1M"))...)
			protected.GET("/partners/:id", itemHandler.GetPartner, rbacMW(c, "partner", "read")...)
		}

		// ─── Stock Ledger endpoints (Phase 4) ───────────────────────────
		if c.StockUsecase != nil {
			stockHandler := handler.NewStockHandler(c.StockUsecase)
			protected.GET("/stock/movements", stockHandler.ListMovements, rbacMW(c, "stock", "read")...)
		}

		// ─── Inbound / GRN endpoints (Fase 6) ───────────────────────────
		if c.ReceiptUsecase != nil {
			receiptHandler := handler.NewReceiptHandler(c.ReceiptUsecase)
			protected.POST("/receipts", receiptHandler.CreateReceipt,
				append(rbacMW(c, "grn", "create"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/receipts/:id/submit", receiptHandler.SubmitReceipt, rbacMW(c, "grn", "approve")...)
			protected.POST("/receipts/:id/approve", receiptHandler.ApproveReceipt, rbacMW(c, "grn", "approve")...)
			protected.GET("/receipts/:id/putaway-suggestion", receiptHandler.PutawaySuggestion, rbacMW(c, "grn", "putaway")...)
			protected.POST("/receipts/:id/putaway", receiptHandler.Putaway,
				append(rbacMW(c, "grn", "putaway"), echoMiddleware.BodyLimit("1M"))...)
		}

		// ─── Outbound endpoints (Fase 7) ────────────────────────────────
		if c.OutboundUsecase != nil {
			outboundHandler := handler.NewOutboundHandler(c.OutboundUsecase)
			protected.POST("/requests", outboundHandler.CreateRequest,
				append(rbacMW(c, "request", "create"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/requests/:id/submit", outboundHandler.SubmitRequest, rbacMW(c, "request", "approve")...)
			protected.POST("/requests/:id/approve", outboundHandler.ApproveRequest, rbacMW(c, "request", "approve")...)

			protected.POST("/deliveries", outboundHandler.CreateDelivery,
				append(rbacMW(c, "do", "create"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/deliveries/:id/submit", outboundHandler.SubmitDelivery, rbacMW(c, "do", "approve")...)
			protected.POST("/deliveries/:id/approve", outboundHandler.ApproveDelivery, rbacMW(c, "do", "approve")...)
			protected.POST("/deliveries/:id/allocate", outboundHandler.Allocate,
				append(rbacMW(c, "do", "allocate"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/deliveries/:id/allocate/override", outboundHandler.AllocateOverride,
				append(rbacMW(c, "outbound", "override_allocation"), echoMiddleware.BodyLimit("1M"))...)
			protected.GET("/deliveries/:id/picking-list", outboundHandler.PickingList, rbacMW(c, "do", "pick")...)
			protected.POST("/deliveries/:id/pick", outboundHandler.Pick,
				append(rbacMW(c, "do", "pick"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/deliveries/:id/ship", outboundHandler.Ship,
				append(rbacMW(c, "do", "ship"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/deliveries/:id/pod", outboundHandler.Pod,
				append(rbacMW(c, "do", "pod"), echoMiddleware.BodyLimit("1M"))...)
		}

		// ─── Transfer endpoints (Fase 8.1 / M5) ────────────────────────
		if c.TransferUsecase != nil {
			transferHandler := handler.NewTransferHandler(c.TransferUsecase)
			protected.POST("/transfers", transferHandler.CreateTransfer,
				append(rbacMW(c, "transfer", "create"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/transfers/:id/submit", transferHandler.SubmitTransfer, rbacMW(c, "transfer", "approve")...)
			protected.POST("/transfers/:id/approve", transferHandler.ApproveTransfer, rbacMW(c, "transfer", "approve")...)
			protected.POST("/transfers/:id/send", transferHandler.SendTransfer, rbacMW(c, "transfer", "approve")...)
			protected.POST("/transfers/:id/receive", transferHandler.ReceiveTransfer,
				append(rbacMW(c, "transfer", "approve"), echoMiddleware.BodyLimit("1M"))...)
		}

		// ─── Stock opname endpoints (Fase 8.2 - 8.5 / M6) ──────────────
		if c.CountingUsecase != nil {
			countingHandler := handler.NewCountingHandler(c.CountingUsecase)
			protected.POST("/counts", countingHandler.CreateCount,
				append(rbacMW(c, "count", "create"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/counts/:id/lines", countingHandler.InputCountLines,
				append(rbacMW(c, "count", "execute"), echoMiddleware.BodyLimit("1M"))...)
			protected.POST("/counts/:id/post", countingHandler.PostCount, rbacMW(c, "count", "approve")...)
			protected.POST("/adjustments", countingHandler.CreateAdjustment,
				append(rbacMW(c, "adj", "create"), echoMiddleware.BodyLimit("1M"))...)
		}
	}

	// ─── OpenAPI spec + embedded Swagger UI (public) ───────────────────
	registerOpenAPI(e, v1)

	return e
}

// rbacMW returns the Casbin RBAC middleware for the given resource/action,
// or nil when no enforcer is configured (e.g. unit tests without policies).
func rbacMW(c RouterConfig, resource, action string) []echo.MiddlewareFunc {
	if c.Enforcer == nil {
		return nil
	}
	return []echo.MiddlewareFunc{middleware.RBACMiddleware(c.Enforcer, resource, action)}
}
