package middleware

import (
	"context"
	"net/http"
	"strings"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/auth"
	"inventory/internal/pkg/authz"
	"inventory/internal/pkg/logger"

	"github.com/casbin/casbin/v2"
	"github.com/labstack/echo/v4"
)

type authContextKey string

const (
	// ClaimsKey is used to store parsed JWT claims in Echo/request context.
	ClaimsKey authContextKey = "jwt_claims"
	// UserIDKey is the context key for the authenticated user ID.
	UserIDKey authContextKey = "user_id"
	// WarehouseCodeKey is the context key for the active warehouse code.
	WarehouseCodeKey authContextKey = "warehouse_code"
	// WarehouseIDKey is the context key for the numeric warehouse ID resolved
	// from the active warehouse code. It is the authoritative warehouse scope
	// for the data layer (C-01): handlers must use it instead of trusting a
	// client-supplied body/query warehouse_id.
	WarehouseIDKey authContextKey = "warehouse_id"
)

// WarehouseResolver maps an active warehouse code (e.g. "WH01") to its numeric
// primary key, so the data layer can scope by the ID it stores. It is injected
// from the composition root; nil skips resolution (test-only routers).
type WarehouseResolver func(ctx context.Context, code string) (int64, error)

// JWTAuthMiddleware validates the Bearer token from the Authorization header,
// falling back to the access_token cookie set on login (browser clients).
// On success, it injects the parsed claims into the request context.
func JWTAuthMiddleware(jwtSecret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			tokenStr := ""
			authHeader := c.Request().Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			} else if cookie, err := c.Cookie(auth.AccessTokenCookieName); err == nil && cookie.Value != "" {
				tokenStr = cookie.Value
			}

			if tokenStr == "" {
				return response.Error(c, http.StatusUnauthorized,
					"ERR_UNAUTHENTICATED", "Missing or invalid Authorization header", nil,
					reqID(c))
			}

			claims, err := auth.ParseAccessToken(tokenStr, jwtSecret)
			if err != nil {
				return response.Error(c, http.StatusUnauthorized,
					"ERR_UNAUTHENTICATED", "Token invalid or expired", nil,
					reqID(c))
			}

			// Inject into Echo context and request context
			c.Set(string(ClaimsKey), claims)
			c.Set(string(UserIDKey), claims.UserID)

			ctx := c.Request().Context()
			ctx = context.WithValue(ctx, ClaimsKey, claims)
			ctx = context.WithValue(ctx, logger.UserIDKey, claims.UserID)
			c.SetRequest(c.Request().WithContext(ctx))

			return next(c)
		}
	}
}

// RBACMiddleware authorizes the authenticated user against Casbin for a given
// resource and action. The active warehouse is extracted from the mandatory
// X-Warehouse-Id request header; its numeric ID is resolved once here and made
// the authoritative scope for the data layer (C-01).
func RBACMiddleware(enforcer *casbin.Enforcer, resource, action string, resolve WarehouseResolver) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			warehouseCode := c.Request().Header.Get("X-Warehouse-Id")
			if warehouseCode == "" {
				return response.Error(c, http.StatusBadRequest,
					"ERR_MISSING_WAREHOUSE", "X-Warehouse-Id header is required", nil,
					reqID(c))
			}

			claims, ok := c.Get(string(ClaimsKey)).(*auth.TokenClaims)
			if !ok || claims == nil {
				return response.Error(c, http.StatusUnauthorized,
					"ERR_UNAUTHENTICATED", "No authenticated user in context", nil,
					reqID(c))
			}

			// The requested warehouse must be one the user is assigned to (FR-10.2);
			// policies alone are role-level and do not encode per-user assignments.
			assigned := false
			for _, w := range claims.Warehouses {
				if w == warehouseCode {
					assigned = true
					break
				}
			}
			if !assigned {
				return response.Error(c, http.StatusForbidden,
					"ERR_FORBIDDEN", "Warehouse is not assigned to your account", nil,
					reqID(c))
			}

			// Check each role the user holds for this warehouse
			allowed := false
			for _, role := range claims.Roles {
				ok, err := enforcer.Enforce(role, warehouseCode, resource, action)
				if err != nil {
					return response.Error(c, http.StatusInternalServerError,
						"ERR_INTERNAL", "Authorization check failed", nil, reqID(c))
				}
				if ok {
					allowed = true
					break
				}
			}

			if !allowed {
				return response.Error(c, http.StatusForbidden,
					"ERR_FORBIDDEN", "You do not have permission to perform this action", nil,
					reqID(c))
			}

			// Inject active warehouse code into Echo and request context
			c.Set(string(WarehouseCodeKey), warehouseCode)
			ctx := c.Request().Context()
			ctx = context.WithValue(ctx, WarehouseCodeKey, warehouseCode)

			// Resolve the numeric warehouse ID from the code. Handlers use this
			// ID (not a client-supplied body/query warehouse_id) for every write.
			if resolve != nil {
				whID, err := resolve(ctx, warehouseCode)
				if err != nil {
					return response.Error(c, http.StatusInternalServerError,
						"ERR_INTERNAL", "Failed to resolve active warehouse", nil, reqID(c))
				}
				c.Set(string(WarehouseIDKey), whID)
				// Same value, authz-owned key, so usecase guards (C-02) can read it.
				ctx = authz.WithWarehouseID(ctx, whID)
			}

			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	}
}

// GetClaims retrieves parsed JWT claims from Echo context.
func GetClaims(c echo.Context) (*auth.TokenClaims, bool) {
	claims, ok := c.Get(string(ClaimsKey)).(*auth.TokenClaims)
	return claims, ok
}

// reqID is a helper to get the current request_id from Echo context.
func reqID(c echo.Context) string {
	id, _ := c.Get("request_id").(string)
	return id
}
