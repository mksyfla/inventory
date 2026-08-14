package handler

import (
	"fmt"
	"net/http"
	"time"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/document"
	"inventory/internal/usecase/inbound"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// ReceiptHandler serves the inbound module (Fase 6): GRN creation, submit,
// approve, putaway suggestion and putaway execution.
type ReceiptHandler struct {
	uc *inbound.ReceiptUsecase
}

// NewReceiptHandler wires the inbound usecase to HTTP.
func NewReceiptHandler(uc *inbound.ReceiptUsecase) *ReceiptHandler {
	return &ReceiptHandler{uc: uc}
}

// CreateReceipt handles POST /api/v1/receipts (FR-2.1).
func (h *ReceiptHandler) CreateReceipt(c echo.Context) error {
	var req dto.CreateReceiptRequest
	if !bindAndValidate(c, &req) {
		return nil
	}

	// FSD 4.5: the idempotency key travels as the Idempotency-Key header
	// (body field accepted too for flexibility). Both must be UUIDv4.
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

	in := inbound.CreateInput{
		WarehouseID:    req.WarehouseID,
		PartnerID:      req.PartnerID,
		IdempotencyKey: req.IdempotencyKey,
		Notes:          req.Notes,
		CreatedBy:      userIDFromCtx(c),
	}
	for i, ln := range req.Lines {
		var expiry *time.Time
		if ln.ExpiryDate != nil {
			t, err := time.Parse("2006-01-02", *ln.ExpiryDate)
			if err != nil {
				return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION",
					"Invalid request payload",
					[]response.ErrorDetail{{Field: "lines[" + itoa(i) + "].expiry_date", Message: "must be a valid date YYYY-MM-DD"}}, "")
			}
			expiry = &t
		}
		in.Lines = append(in.Lines, inbound.CreateLineInput{
			ItemID:     ln.ItemID,
			Qty:        ln.Qty,
			Uom:        ln.Uom,
			BatchNo:    ln.BatchNo,
			ExpiryDate: expiry,
			Status:     ln.Status,
			Notes:      ln.Notes,
		})
	}

	doc, lines, err := h.uc.Create(c.Request().Context(), in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create receipt")
	}
	return response.Success(c, http.StatusCreated, receiptDocumentResponse(doc, lines), nil)
}

// SubmitReceipt handles POST /api/v1/receipts/:id/submit (FSD 4.4).
func (h *ReceiptHandler) SubmitReceipt(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.Submit(c.Request().Context(), id); err != nil {
		return writeUsecaseError(c, err, "Failed to submit receipt")
	}
	return response.Success(c, http.StatusOK, dto.ReceiptStatusResponse{
		ID:     id,
		Status: string(document.StatusSubmitted),
	}, nil)
}

// ApproveReceipt handles POST /api/v1/receipts/:id/approve
// (maker-checker BR-05, posting to staging).
func (h *ReceiptHandler) ApproveReceipt(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.Approve(c.Request().Context(), id, userIDFromCtx(c)); err != nil {
		return writeUsecaseError(c, err, "Failed to approve receipt")
	}
	return response.Success(c, http.StatusOK, dto.ReceiptStatusResponse{
		ID:     id,
		Status: string(document.StatusApproved),
	}, nil)
}

// PutawaySuggestion handles GET /api/v1/receipts/:id/putaway-suggestion
// (FR-2.5).
func (h *ReceiptHandler) PutawaySuggestion(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	suggestions, err := h.uc.SuggestPutaway(c.Request().Context(), id)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to build putaway suggestion")
	}
	if suggestions == nil {
		suggestions = []inbound.PutawaySuggestion{}
	}
	return response.Success(c, http.StatusOK, suggestions, nil)
}

// Putaway handles POST /api/v1/receipts/:id/putaway (FR-2.5).
func (h *ReceiptHandler) Putaway(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.PutawayRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	scans := make([]inbound.PutawayScan, 0, len(req.Lines))
	for _, ln := range req.Lines {
		scans = append(scans, inbound.PutawayScan{
			LineID:       ln.LineID,
			Qty:          ln.Qty,
			LocationCode: ln.LocationCode,
		})
	}
	status, err := h.uc.Putaway(c.Request().Context(), id, userIDFromCtx(c), scans)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to execute putaway")
	}
	return response.Success(c, http.StatusOK, dto.ReceiptStatusResponse{
		ID:     id,
		Status: string(status),
	}, nil)
}

// receiptDocumentResponse maps the domain document (header + lines) into the
// API summary.
func receiptDocumentResponse(doc *document.Document, lines []*document.DocumentLine) dto.ReceiptDocumentResponse {
	resp := dto.ReceiptDocumentResponse{
		ID:          doc.ID,
		PublicID:    doc.PublicID,
		DocNo:       doc.DocNo,
		DocType:     doc.DocType.String(),
		DocDate:     doc.DocDate.Format("2006-01-02"),
		Status:      doc.Status.String(),
		WarehouseID: doc.WarehouseID,
		PartnerID:   doc.PartnerID,
		Notes:       doc.Notes,
		CreatedBy:   doc.CreatedBy,
		Lines:       []dto.ReceiptLineSummary{},
	}
	for _, ln := range lines {
		resp.Lines = append(resp.Lines, dto.ReceiptLineSummary{
			ID:           ln.ID,
			LineNo:       ln.LineNo,
			ItemID:       ln.ItemID,
			Uom:          ln.Uom,
			QtyRequest:   ln.QtyRequest,
			QtyProcessed: ln.QtyProcessed,
			BatchID:      ln.BatchID,
			LocationID:   ln.LocationID,
			Status:       ln.Status,
		})
	}
	return resp
}

func itoa(i int) string {
	return fmt.Sprintf("%d", i)
}
