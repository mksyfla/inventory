package http

import (
	"net/http"

	"inventory/internal/delivery/http/handler"
	"inventory/internal/delivery/http/middleware"
	"inventory/internal/delivery/http/response"
	redisclient "inventory/internal/pkg/redis"
	"inventory/internal/pkg/validation"
	itemuc "inventory/internal/usecase/item"
	stockuc "inventory/internal/usecase/stock"

	"github.com/casbin/casbin/v2"
	"github.com/hibiken/asynq"
	"github.com/labstack/echo/v4"
	echoMiddleware "github.com/labstack/echo/v4/middleware"
)

// RouterConfig holds dependencies required to configure the Echo router.
type RouterConfig struct {
	JWTSecret     string
	AppEnv        string
	Enforcer      *casbin.Enforcer
	Store         redisclient.KVStore
	LookupUser    handler.UserLookup
	LookupUserByID handler.UserLookupByID
	ItemUsecase   *itemuc.Usecase
	StockUsecase  *stockuc.PostingUsecase
	AsynqClient   *asynq.Client
	CreateUser    handler.CreateUserFunc
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
