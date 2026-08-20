package handler

import (
	"net/http"
	"strconv"
	"time"

	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/query"
	queryuc "inventory/internal/usecase/query"

	"github.com/labstack/echo/v4"
)

const (
	queryDefaultLimit = 50
	queryMaxLimit     = 100
)

// QueryHandler serves the shared read-only GET endpoints (documents, stock,
// admin, reports and dashboard). One handler covers all document types since
// the list/detail shapes are identical; only the filter (doc_type) differs.
type QueryHandler struct {
	uc *queryuc.ReadUsecase
}

func NewQueryHandler(uc *queryuc.ReadUsecase) *QueryHandler {
	return &QueryHandler{uc: uc}
}

// warehouseCode returns the active warehouse code: always prioritizes the
// mandatory X-Warehouse-Id header verified by RBAC middleware.
func warehouseCode(c echo.Context) string {
	headerCode := c.Request().Header.Get("X-Warehouse-Id")
	if headerCode != "" {
		return headerCode
	}
	if ctxCode, ok := c.Get("warehouse_code").(string); ok && ctxCode != "" {
		return ctxCode
	}
	return c.QueryParam("warehouse_code")
}

// ListDocuments handles GET /api/v1/documents.
func (h *QueryHandler) ListDocuments(c echo.Context) error {
	f := query.DocumentFilter{
		DocType:     c.QueryParam("doc_type"),
		Status:      c.QueryParam("status"),
		Limit:       queryDefaultLimit,
		WarehouseID: 0,
	}

	if whStr := c.QueryParam("warehouse_id"); whStr != "" {
		id, err := strconv.ParseInt(whStr, 10, 64)
		if err != nil || id < 0 {
			return queryValidationError(c, "warehouse_id", "must be a non-negative integer")
		}
		f.WarehouseID = id
	}

	limit, offset, ok := parseLimitOffset(c)
	if !ok {
		return nil
	}
	f.Limit = limit
	f.Offset = offset

	rows, err := h.uc.ListDocuments(c.Request().Context(), f)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve documents")
	}
	if rows == nil {
		rows = []query.DocumentSummary{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// GetDocumentDetail handles GET /api/v1/documents/:id.
func (h *QueryHandler) GetDocumentDetail(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	doc, err := h.uc.GetDocumentDetail(c.Request().Context(), id)
	if err != nil {
		return writeUsecaseError(c, err, "Document not found")
	}

	// C-03 IDOR protection: verify document warehouse against caller's warehouse header
	headerWh := c.Request().Header.Get("X-Warehouse-Id")
	if headerWh != "" && doc.WarehouseCode != headerWh && doc.DestWarehouseCode != headerWh {
		return response.Error(c, http.StatusNotFound, "ERR_NOT_FOUND", "Document not found", nil, reqID(c))
	}

	return response.Success(c, http.StatusOK, doc, nil)
}

// GetCountDocumentDetail handles GET /api/v1/counts/{id}: the CNT header plus
// snapshot/result lines. `?blind=1` is the field-screen variant — it omits
// qty_system from the payload so the counting device never receives the
// system quantity (Blind Count FR-6.1). Without it, the supervisor gets the
// full reconciliation view.
func (h *QueryHandler) GetCountDocumentDetail(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	blind := c.QueryParam("blind") == "1" || c.QueryParam("blind") == "true"
	doc, err := h.uc.GetCountDocumentDetail(c.Request().Context(), id, blind)
	if err != nil {
		return writeUsecaseError(c, err, "Count session not found")
	}

	headerWh := c.Request().Header.Get("X-Warehouse-Id")
	if headerWh != "" && doc.WarehouseCode != headerWh {
		return response.Error(c, http.StatusNotFound, "ERR_NOT_FOUND", "Count session not found", nil, reqID(c))
	}

	return response.Success(c, http.StatusOK, doc, nil)
}

// ListStockBalances handles GET /api/v1/stock/balances.
func (h *QueryHandler) ListStockBalances(c echo.Context) error {
	f := query.StockBalanceFilter{
		WarehouseCode: warehouseCode(c),
		Status:        c.QueryParam("status"),
		Search:        c.QueryParam("search"),
	}

	if catStr := c.QueryParam("category_id"); catStr != "" {
		id, err := strconv.ParseInt(catStr, 10, 64)
		if err != nil || id < 0 {
			return queryValidationError(c, "category_id", "must be a non-negative integer")
		}
		f.CategoryID = id
	}

	rows, err := h.uc.ListStockBalances(c.Request().Context(), f)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve stock balances")
	}
	if rows == nil {
		rows = []query.StockBalance{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// ListBatchTrace handles GET /api/v1/stock/batches?search=.
func (h *QueryHandler) ListBatchTrace(c echo.Context) error {
	rows, err := h.uc.ListBatchTrace(c.Request().Context(), c.QueryParam("search"))
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve batch trace")
	}
	if rows == nil {
		rows = []query.BatchTrace{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// ListStockLedger handles GET /api/v1/stock/ledger — the immutable movement
// ledger behind the stock card page. from/to default to a wide range when the
// caller omits them; item_id uses 0 = all items.
func (h *QueryHandler) ListStockLedger(c echo.Context) error {
	f := query.StockLedgerFilter{
		ItemID: 0,
		From:   time.Date(1970, 1, 1, 0, 0, 0, 0, time.UTC),
		To:     time.Date(2999, 12, 31, 23, 59, 59, 0, time.UTC),
		Limit:  queryDefaultLimit,
	}

	if itemStr := c.QueryParam("item_id"); itemStr != "" {
		id, err := strconv.ParseInt(itemStr, 10, 64)
		if err != nil || id < 1 {
			return queryValidationError(c, "item_id", "must be a positive integer")
		}
		f.ItemID = id
	}
	if fromStr := c.QueryParam("from"); fromStr != "" {
		t, err := time.Parse(time.RFC3339, fromStr)
		if err != nil {
			return queryValidationError(c, "from", "must be RFC3339, e.g. 2026-08-01T00:00:00Z")
		}
		f.From = t
	}
	if toStr := c.QueryParam("to"); toStr != "" {
		t, err := time.Parse(time.RFC3339, toStr)
		if err != nil {
			return queryValidationError(c, "to", "must be RFC3339, e.g. 2026-08-01T00:00:00Z")
		}
		f.To = t
	}
	if f.To.Before(f.From) {
		return queryValidationError(c, "to", "must be greater than or equal to from")
	}

	limit, offset, ok := parseLimitOffset(c)
	if !ok {
		return nil
	}
	f.Limit = limit
	f.Offset = offset

	rows, err := h.uc.ListStockLedger(c.Request().Context(), f)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve stock ledger")
	}
	if rows == nil {
		rows = []query.StockLedgerRow{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// ListWarehouses handles GET /api/v1/warehouses.
func (h *QueryHandler) ListWarehouses(c echo.Context) error {
	rows, err := h.uc.ListWarehouses(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve warehouses")
	}
	if rows == nil {
		rows = []query.Warehouse{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// ListUsers handles GET /api/v1/users.
func (h *QueryHandler) ListUsers(c echo.Context) error {
	rows, err := h.uc.ListUsers(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve users")
	}
	if rows == nil {
		rows = []query.UserSummary{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// ListRoles handles GET /api/v1/roles.
func (h *QueryHandler) ListRoles(c echo.Context) error {
	rows, err := h.uc.ListRoles(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve roles")
	}
	if rows == nil {
		rows = []query.RoleSummary{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// ListPermissions handles GET /api/v1/permissions (role permission matrix).
func (h *QueryHandler) ListPermissions(c echo.Context) error {
	rows, err := h.uc.ListPermissions(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve permissions")
	}
	if rows == nil {
		rows = []query.PermissionSummary{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// ListAuditLogs handles GET /api/v1/audit-logs.
func (h *QueryHandler) ListAuditLogs(c echo.Context) error {
	limit, offset, ok := parseLimitOffset(c)
	if !ok {
		return nil
	}
	rows, err := h.uc.ListAuditLogs(c.Request().Context(), limit, offset)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve audit logs")
	}
	if rows == nil {
		rows = []query.AuditLog{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// GetFsnReport handles GET /api/v1/reports/fsn.
func (h *QueryHandler) GetFsnReport(c echo.Context) error {
	rows, err := h.uc.GetFsnReport(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve FSN report")
	}
	if rows == nil {
		rows = []query.FsnReportRow{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// GetValuationReport handles GET /api/v1/reports/valuation.
func (h *QueryHandler) GetValuationReport(c echo.Context) error {
	rows, err := h.uc.GetValuationReport(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve valuation report")
	}
	if rows == nil {
		rows = []query.ValuationReportRow{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// GetSpaceUtilizationReport handles GET /api/v1/reports/space-utilization.
func (h *QueryHandler) GetSpaceUtilizationReport(c echo.Context) error {
	rows, err := h.uc.GetSpaceUtilizationReport(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve space utilization report")
	}
	if rows == nil {
		rows = []query.SpaceUtilizationRow{}
	}
	return response.Success(c, http.StatusOK, rows, nil)
}

// GetDashboardSummary handles GET /api/v1/dashboard/summary.
func (h *QueryHandler) GetDashboardSummary(c echo.Context) error {
	summary, err := h.uc.GetDashboardSummary(c.Request().Context())
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve dashboard summary")
	}
	return response.Success(c, http.StatusOK, summary, nil)
}

// parseLimitOffset reads the optional limit/offset query params with safe
// defaults and clamps limit to queryMaxLimit. It writes the validation error
// envelope itself and returns ok=false (response already committed).
func parseLimitOffset(c echo.Context) (limit, offset int, ok bool) {
	limit = queryDefaultLimit
	if limitStr := c.QueryParam("limit"); limitStr != "" {
		v, err := strconv.ParseInt(limitStr, 10, 32)
		if err != nil || v < 1 || v > queryMaxLimit {
			_ = queryValidationError(c, "limit", "must be an integer between 1 and 100")
			return 0, 0, false
		}
		limit = int(v)
	}
	if offsetStr := c.QueryParam("offset"); offsetStr != "" {
		v, err := strconv.ParseInt(offsetStr, 10, 32)
		if err != nil || v < 0 {
			_ = queryValidationError(c, "offset", "must be a non-negative integer")
			return 0, 0, false
		}
		offset = int(v)
	}
	return limit, offset, true
}
