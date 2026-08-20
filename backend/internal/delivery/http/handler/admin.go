package handler

import (
	"encoding/json"
	"net/http"
	"net/netip"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	adminuc "inventory/internal/usecase/admin"

	"github.com/labstack/echo/v4"
)

// AdminHandler serves the RBAC write endpoints (Fase 10.x): create/update
// users, create/update roles, and the persistent system-settings store. The
// matching GETs (users, roles, audit-logs) live in QueryHandler.
type AdminHandler struct {
	uc *adminuc.AdminUsecase
}

func NewAdminHandler(uc *adminuc.AdminUsecase) *AdminHandler {
	return &AdminHandler{uc: uc}
}

// CreateUser handles POST /users.
func (h *AdminHandler) CreateUser(c echo.Context) error {
	var req dto.CreateUserRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	ipAddr := netip.MustParseAddr(c.RealIP())

	id, err := h.uc.CreateUser(c.Request().Context(), adminuc.CreateUserInput{
		Username:     req.Username,
		Email:        req.Email,
		FullName:     req.FullName,
		Phone:        req.Phone,
		Password:     req.Password,
		IsActive:     isActive,
		Roles:        req.Roles,
		WarehouseIDs: req.WarehouseIDs,
		ActorID:      userIDFromCtx(c),
	}, &ipAddr)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create user")
	}
	return response.Success(c, http.StatusCreated, map[string]int64{"id": id}, nil)
}

// UpdateUser handles PATCH /users/:id.
func (h *AdminHandler) UpdateUser(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}

	var req dto.UpdateUserRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	ipAddr := netip.MustParseAddr(c.RealIP())

	err := h.uc.UpdateUser(c.Request().Context(), adminuc.UpdateUserInput{
		ID:           id,
		FullName:     req.FullName,
		Email:        req.Email,
		Phone:        req.Phone,
		Password:     req.Password,
		IsActive:     isActive,
		Roles:        req.Roles,
		WarehouseIDs: req.WarehouseIDs,
		ActorID:      userIDFromCtx(c),
	}, &ipAddr)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to update user")
	}
	return response.Success(c, http.StatusOK, map[string]int64{"id": id}, nil)
}

// CreateRole handles POST /roles.
func (h *AdminHandler) CreateRole(c echo.Context) error {
	var req dto.CreateRoleRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	ipAddr := netip.MustParseAddr(c.RealIP())

	id, err := h.uc.CreateRole(c.Request().Context(), adminuc.CreateRoleInput{
		Code:        req.Code,
		Name:        req.Name,
		Description: req.Description,
		Permissions: req.Permissions,
		ActorID:     userIDFromCtx(c),
	}, &ipAddr)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create role")
	}
	return response.Success(c, http.StatusCreated, map[string]int64{"id": id}, nil)
}

// UpdateRole handles PATCH /roles/:id.
func (h *AdminHandler) UpdateRole(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}

	var req dto.UpdateRoleRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	ipAddr := netip.MustParseAddr(c.RealIP())

	err := h.uc.UpdateRole(c.Request().Context(), adminuc.UpdateRoleInput{
		ID:          id,
		Code:        req.Code,
		Name:        req.Name,
		Description: req.Description,
		Permissions: req.Permissions,
		ActorID:     userIDFromCtx(c),
	}, &ipAddr)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to update role")
	}
	return response.Success(c, http.StatusOK, map[string]int64{"id": id}, nil)
}

// GetSettings handles GET /settings. Returns the flat JSON object persisted by
// PUT /settings; empty object when nothing is stored yet.
func (h *AdminHandler) GetSettings(c echo.Context) error {
	settings, err := h.uc.GetSettings(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to load settings")
	}
	if settings == nil {
		settings = map[string]json.RawMessage{}
	}
	return response.Success(c, http.StatusOK, settings, nil)
}

// UpdateSettings handles PUT /settings. The body is a flat JSON object; every
// key is upserted into the settings store.
func (h *AdminHandler) UpdateSettings(c echo.Context) error {
	var payload map[string]json.RawMessage
	if err := c.Bind(&payload); err != nil {
		return queryValidationError(c, "body", "malformed JSON object")
	}

	ipAddr := netip.MustParseAddr(c.RealIP())

	err := h.uc.UpdateSettings(c.Request().Context(), payload, userIDFromCtx(c), &ipAddr)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to update settings")
	}
	return response.Success(c, http.StatusOK, map[string]any{"updated": true}, nil)
}
