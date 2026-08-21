package handler

import (
	"net/http"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/document"
	countinguc "inventory/internal/usecase/counting"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// CountingHandler serves the stock opname module (Fase 8.2 - 8.5): count
// sessions with blind snapshot, field count input, tiered-approval posting
// and manual adjustments.
type CountingHandler struct {
	uc *countinguc.CountingUsecase
}

// NewCountingHandler wires the counting usecase to HTTP.
func NewCountingHandler(uc *countinguc.CountingUsecase) *CountingHandler {
	return &CountingHandler{uc: uc}
}

// CreateCount handles POST /api/v1/counts (FR-6.1): opens a count session and
// snapshots qty_system (Blind Count — the response omits qty_system).
func (h *CountingHandler) CreateCount(c echo.Context) error {
	var req dto.CreateCountRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	if req.IdempotencyKey == "" {
		req.IdempotencyKey = c.Request().Header.Get("Idempotency-Key")
	}
	if req.IdempotencyKey != "" {
		if _, err := uuid.Parse(req.IdempotencyKey); err != nil {
			return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION",
				"Invalid request payload",
				[]response.ErrorDetail{{Field: "idempotency_key", Message: "must be a valid UUIDv4"}}, "")
		}
	}

	// C-01: body warehouse_id must match the authenticated warehouse.
	whID, ok := warehouseIDFromCtx(c)
	if !ok || req.WarehouseID != whID {
		return warehouseMismatch(c)
	}

	doc, lines, err := h.uc.CreateCount(c.Request().Context(), countinguc.CreateCountInput{
		WarehouseID:    whID,
		Zone:           req.Zone,
		ItemIDs:        req.ItemIDs,
		IdempotencyKey: req.IdempotencyKey,
		Notes:          req.Notes,
		CreatedBy:      userIDFromCtx(c),
	})
	if err != nil {
		return writeUsecaseError(c, err, "Failed to open count session")
	}
	return response.Success(c, http.StatusCreated, countDocumentResponse(doc, lines), nil)
}

// InputCountLines handles POST /api/v1/counts/{id}/lines (FR-6.2): records the
// field counts; the response exposes the computed variance per line.
func (h *CountingHandler) InputCountLines(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.InputCountLinesRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	in := countinguc.InputCountInput{UserID: userIDFromCtx(c)}
	for _, ln := range req.Lines {
		in.Lines = append(in.Lines, countinguc.InputCountLineInput{
			CountLineID: ln.CountLineID,
			QtyCounted:  ln.QtyCounted,
			ReasonCode:  ln.ReasonCode,
		})
	}
	lines, err := h.uc.InputCountLines(c.Request().Context(), id, in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to record count lines")
	}
	return response.Success(c, http.StatusOK, countLinesResponse(lines), nil)
}

// PostCount handles POST /api/v1/counts/{id}/post (M6.4 - M6.5): approves and
// posts the count session. When the total variance value exceeds the
// threshold, manager_approver_id is required (tiered approval).
func (h *CountingHandler) PostCount(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.PostCountRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	result, err := h.uc.PostCount(c.Request().Context(), id, countinguc.PostCountInput{
		ApproverID:        userIDFromCtx(c),
		ManagerApproverID: req.ManagerApproverID,
	})
	if err != nil {
		return writeUsecaseError(c, err, "Failed to post count session")
	}
	return response.Success(c, http.StatusOK, dto.PostCountResponse{
		ID:                    id,
		Status:                string(result.Status),
		TotalVariance:         result.TotalVariance,
		TotalVarianceValue:    result.TotalVarianceValue,
		NeedsManagerApproval:  result.NeedsManagerApproval,
		PostedAdjustmentLines: result.PostedAdjustmentLines,
	}, nil)
}

// CreateAdjustment handles POST /api/v1/adjustments (FR-6.5): direct manual
// adjustment outside an opname. reason_code and a written explanation are
// mandatory.
func (h *CountingHandler) CreateAdjustment(c echo.Context) error {
	var req dto.CreateAdjustmentRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	if req.IdempotencyKey == "" {
		req.IdempotencyKey = c.Request().Header.Get("Idempotency-Key")
	}
	if req.IdempotencyKey != "" {
		if _, err := uuid.Parse(req.IdempotencyKey); err != nil {
			return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION",
				"Invalid request payload",
				[]response.ErrorDetail{{Field: "idempotency_key", Message: "must be a valid UUIDv4"}}, "")
		}
	}

	// C-01: body warehouse_id must match the authenticated warehouse.
	whID, ok := warehouseIDFromCtx(c)
	if !ok || req.WarehouseID != whID {
		return warehouseMismatch(c)
	}

	in := countinguc.CreateAdjustmentInput{
		WarehouseID:    whID,
		ReasonCode:     req.ReasonCode,
		Notes:          req.Notes,
		IdempotencyKey: req.IdempotencyKey,
		CreatedBy:      userIDFromCtx(c),
	}
	for _, ln := range req.Lines {
		in.Lines = append(in.Lines, countinguc.AdjustmentLineInput{
			ItemID:     ln.ItemID,
			LocationID: ln.LocationID,
			BatchID:    ln.BatchID,
			Qty:        ln.Qty,
			Status:     ln.Status,
			ReasonCode: ln.ReasonCode,
		})
	}
	doc, err := h.uc.CreateAdjustment(c.Request().Context(), in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create adjustment")
	}
	return response.Success(c, http.StatusCreated, adjustmentDocumentResponse(doc), nil)
}

// countDocumentResponse maps a CNT document + snapshot lines into the API
// summary. qty_system is omitted (Blind Count — FR-6.1).
func countDocumentResponse(doc *document.Document, lines []*document.CountLine) dto.CountDocumentResponse {
	resp := dto.CountDocumentResponse{
		ID:          doc.ID,
		PublicID:    doc.PublicID,
		DocNo:       doc.DocNo,
		DocType:     doc.DocType.String(),
		DocDate:     doc.DocDate.Format("2006-01-02"),
		Status:      doc.Status.String(),
		WarehouseID: doc.WarehouseID,
		Notes:       doc.Notes,
		CreatedBy:   doc.CreatedBy,
		Lines:       []dto.CountLineSummary{},
	}
	for _, ln := range lines {
		resp.Lines = append(resp.Lines, dto.CountLineSummary{
			ID:         ln.ID,
			ItemID:     ln.ItemID,
			LocationID: ln.LocationID,
			BatchID:    ln.BatchID,
			QtyCounted: ln.QtyCounted,
			Variance:   ln.Variance,
			ReasonCode: ln.ReasonCode,
		})
	}
	return resp
}

// countLinesResponse maps count lines after input (with variance computed).
func countLinesResponse(lines []*document.CountLine) []dto.CountLineSummary {
	out := make([]dto.CountLineSummary, 0, len(lines))
	for _, ln := range lines {
		out = append(out, dto.CountLineSummary{
			ID:         ln.ID,
			ItemID:     ln.ItemID,
			LocationID: ln.LocationID,
			BatchID:    ln.BatchID,
			QtyCounted: ln.QtyCounted,
			Variance:   ln.Variance,
			ReasonCode: ln.ReasonCode,
		})
	}
	return out
}

// adjustmentDocumentResponse maps an ADJ document into the API summary.
func adjustmentDocumentResponse(doc *document.Document) dto.AdjustmentDocumentResponse {
	return dto.AdjustmentDocumentResponse{
		ID:          doc.ID,
		PublicID:    doc.PublicID,
		DocNo:       doc.DocNo,
		DocType:     doc.DocType.String(),
		DocDate:     doc.DocDate.Format("2006-01-02"),
		Status:      doc.Status.String(),
		WarehouseID: doc.WarehouseID,
		ReasonCode:  doc.ReasonCode,
		Notes:       doc.Notes,
		CreatedBy:   doc.CreatedBy,
	}
}
