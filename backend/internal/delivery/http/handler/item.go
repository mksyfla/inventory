package handler

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	itemuc "inventory/internal/usecase/item"

	"github.com/hibiken/asynq"
	"github.com/labstack/echo/v4"
)

const (
	TypeImportSKU = "import:sku"
)

// ItemHandler handles all master data endpoints.
type ItemHandler struct {
	uc          *itemuc.Usecase
	asynqClient *asynq.Client
}

// NewItemHandler creates a new ItemHandler.
func NewItemHandler(uc *itemuc.Usecase, asynqClient *asynq.Client) *ItemHandler {
	return &ItemHandler{uc: uc, asynqClient: asynqClient}
}

// ─── ITEM ENDPOINTS ─────────────────────────────────────────────────────────

// ListItems handles GET /api/v1/items
func (h *ItemHandler) ListItems(c echo.Context) error {
	items, err := h.uc.ListItems(c.Request().Context())
	if err != nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to list items", nil, reqID(c))
	}
	return response.Success(c, http.StatusOK, items, nil)
}

// CreateItem handles POST /api/v1/items
func (h *ItemHandler) CreateItem(c echo.Context) error {
	var req dto.CreateItemRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	in := itemuc.CreateItemInput{
		Sku:          req.Sku,
		Name:         req.Name,
		CategoryID:   req.CategoryID,
		BaseUom:      req.BaseUom,
		IsBatch:      req.IsBatch,
		IsExpiry:     req.IsExpiry,
		IsSerial:     req.IsSerial,
		MinQty:       req.MinQty,
		MaxQty:       req.MaxQty,
		SafetyStock:  req.SafetyStock,
		LeadTimeDays: req.LeadTimeDays,
		AbcClass:     req.AbcClass,
		CreatedBy:    userIDFromCtx(c),
	}
	for _, u := range req.UoMs {
		in.UoMs = append(in.UoMs, itemuc.ItemUoMInput{
			Uom:        u.Uom,
			ConvFactor: u.ConvFactor,
			Barcode:    u.Barcode,
		})
	}

	item, err := h.uc.CreateItem(c.Request().Context(), in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create item")
	}
	return response.Success(c, http.StatusCreated, item, nil)
}

// UpdateItem handles PATCH /api/v1/items/:id
func (h *ItemHandler) UpdateItem(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}

	var req dto.UpdateItemRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	in := itemuc.UpdateItemInput{
		ID:           id,
		Name:         req.Name,
		CategoryID:   req.CategoryID,
		BaseUom:      req.BaseUom,
		IsBatch:      req.IsBatch,
		IsExpiry:     req.IsExpiry,
		IsSerial:     req.IsSerial,
		MinQty:       req.MinQty,
		MaxQty:       req.MaxQty,
		SafetyStock:  req.SafetyStock,
		LeadTimeDays: req.LeadTimeDays,
		AbcClass:     req.AbcClass,
		IsActive:     req.IsActive,
		UpdatedBy:    userIDFromCtx(c),
	}

	item, err := h.uc.UpdateItem(c.Request().Context(), in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to update item")
	}
	return response.Success(c, http.StatusOK, item, nil)
}

// GetItem handles GET /api/v1/items/:id
func (h *ItemHandler) GetItem(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}

	item, uoms, err := h.uc.GetItem(c.Request().Context(), id)
	if err != nil {
		return writeUsecaseError(c, err, "Item not found")
	}
	return response.Success(c, http.StatusOK, map[string]any{"item": item, "uoms": uoms}, nil)
}

// SoftDeleteItem handles DELETE /api/v1/items/:id
func (h *ItemHandler) SoftDeleteItem(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}

	if err := h.uc.SoftDeleteItem(c.Request().Context(), id, userIDFromCtx(c)); err != nil {
		return writeUsecaseError(c, err, "Failed to deactivate item")
	}
	return response.Success(c, http.StatusOK, "item deactivated", nil)
}

// ─── IMPORT ENDPOINT ────────────────────────────────────────────────────────

// ImportItems handles POST /api/v1/items/import
// Accepts a multipart CSV upload, parses headers for validation, enqueues an asynq job,
// and immediately returns HTTP 202 with a job_id.
func (h *ItemHandler) ImportItems(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION", "Missing file upload (field: file)", nil, reqID(c))
	}

	src, err := file.Open()
	if err != nil {
		return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION", "Cannot open uploaded file", nil, reqID(c))
	}
	defer src.Close()

	// Basic CSV header validation
	reader := csv.NewReader(src)
	headers, err := reader.Read()
	if err != nil {
		return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION", "Cannot parse CSV headers", nil, reqID(c))
	}

	required := map[string]bool{"sku": false, "name": false, "base_uom": false}
	for _, h := range headers {
		if _, ok := required[h]; ok {
			required[h] = true
		}
	}
	for col, found := range required {
		if !found {
			return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION",
				fmt.Sprintf("Missing required CSV column: %s", col), nil, reqID(c))
		}
	}

	// Enqueue background job with the file metadata (JSON-encoded to avoid
	// filename content corrupting the payload).
	jobID := fmt.Sprintf("import-sku-%s", reqID(c))
	payload, err := json.Marshal(map[string]string{"job_id": jobID, "filename": file.Filename})
	if err != nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to build import job", nil, reqID(c))
	}
	task := asynq.NewTask(TypeImportSKU, payload)

	if h.asynqClient != nil {
		if _, err := h.asynqClient.Enqueue(task); err != nil {
			return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to enqueue import job", nil, reqID(c))
		}
	}

	return response.Success(c, http.StatusAccepted, dto.ImportJobResponse{
		JobID:  jobID,
		Status: "queued",
	}, nil)
}

// ─── LOCATION ENDPOINTS ──────────────────────────────────────────────────────

// CreateLocation handles POST /api/v1/locations
func (h *ItemHandler) CreateLocation(c echo.Context) error {
	var req dto.CreateLocationRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	in := itemuc.CreateLocationInput{
		WarehouseID: req.WarehouseID,
		Code:        req.Code,
		Zone:        req.Zone,
		Rack:        req.Rack,
		Level:       req.Level,
		LocType:     req.LocType,
		PickSeq:     req.PickSeq,
		Capacity:    req.Capacity,
	}

	loc, err := h.uc.CreateLocation(c.Request().Context(), in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create location")
	}
	return response.Success(c, http.StatusCreated, loc, nil)
}

// ListLocations handles GET /api/v1/locations?warehouse_id=
func (h *ItemHandler) ListLocations(c echo.Context) error {
	warehouseIDStr := c.QueryParam("warehouse_id")
	if warehouseIDStr == "" {
		return queryValidationError(c, "warehouse_id", "is required")
	}
	warehouseID, err := strconv.ParseInt(warehouseIDStr, 10, 64)
	if err != nil || warehouseID <= 0 {
		return queryValidationError(c, "warehouse_id", "must be a positive integer")
	}

	locations, err := h.uc.ListLocations(c.Request().Context(), warehouseID)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to list locations")
	}
	return response.Success(c, http.StatusOK, locations, nil)
}

// ─── PARTNER ENDPOINTS ───────────────────────────────────────────────────────

// CreatePartner handles POST /api/v1/partners
func (h *ItemHandler) CreatePartner(c echo.Context) error {
	var req dto.CreatePartnerRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	in := itemuc.CreatePartnerInput{
		Code:         req.Code,
		PartnerType:  req.PartnerType,
		Name:         req.Name,
		Address:      req.Address,
		ContactName:  req.ContactName,
		ContactPhone: req.ContactPhone,
	}

	partner, err := h.uc.CreatePartner(c.Request().Context(), in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create partner")
	}
	return response.Success(c, http.StatusCreated, partner, nil)
}

// GetPartner handles GET /api/v1/partners/:id
func (h *ItemHandler) GetPartner(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}

	partner, err := h.uc.GetPartner(c.Request().Context(), id)
	if err != nil {
		return writeUsecaseError(c, err, "Partner not found")
	}
	return response.Success(c, http.StatusOK, partner, nil)
}

// ListPartners handles GET /api/v1/partners
func (h *ItemHandler) ListPartners(c echo.Context) error {
	partners, err := h.uc.ListPartners(c.Request().Context())
	if err != nil {
		return response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to list partners", nil, reqID(c))
	}
	return response.Success(c, http.StatusOK, partners, nil)
}

// ─── CATEGORY ENDPOINTS ─────────────────────────────────────────────────────

// ListCategories handles GET /api/v1/categories
func (h *ItemHandler) ListCategories(c echo.Context) error {
	categories, err := h.uc.ListCategories(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to list categories")
	}
	return response.Success(c, http.StatusOK, categories, nil)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func userIDFromCtx(c echo.Context) int64 {
	id, _ := c.Get("user_id").(int64)
	return id
}
