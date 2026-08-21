package handler

import (
	"net/http"
	"net/netip"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/document"
	transferuc "inventory/internal/usecase/transfer"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// TransferHandler serves the inter-warehouse transfer module (Fase 8.1):
// TRF documents, send (in_transit) and receive with discrepancy logging.
type TransferHandler struct {
	uc *transferuc.TransferUsecase
}

// NewTransferHandler wires the transfer usecase to HTTP.
func NewTransferHandler(uc *transferuc.TransferUsecase) *TransferHandler {
	return &TransferHandler{uc: uc}
}

// CreateTransfer handles POST /api/v1/transfers (FR-5.1).
func (h *TransferHandler) CreateTransfer(c echo.Context) error {
	var req dto.CreateTransferRequest
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

	// C-01: the SOURCE warehouse (body warehouse_id) must be the authenticated
	// warehouse; the destination is a separate, intentionally different scope.
	whID, ok := warehouseIDFromCtx(c)
	if !ok || req.WarehouseID != whID {
		return warehouseMismatch(c)
	}

	in := transferuc.CreateTransferInput{
		WarehouseID:     whID,
		DestWarehouseID: req.DestWarehouseID,
		IdempotencyKey:  req.IdempotencyKey,
		Notes:           req.Notes,
		CreatedBy:       userIDFromCtx(c),
	}
	for _, ln := range req.Lines {
		in.Lines = append(in.Lines, transferuc.CreateLineInput{
			ItemID: ln.ItemID,
			Qty:    ln.Qty,
			Uom:    ln.Uom,
			Notes:  ln.Notes,
		})
	}

	doc, lines, err := h.uc.CreateTransfer(c.Request().Context(), in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create transfer")
	}
	return response.Success(c, http.StatusCreated, transferDocumentResponse(doc, lines), nil)
}

// SubmitTransfer handles POST /api/v1/transfers/{id}/submit (FSD 4.4).
func (h *TransferHandler) SubmitTransfer(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.SubmitTransfer(c.Request().Context(), id); err != nil {
		return writeUsecaseError(c, err, "Failed to submit transfer")
	}
	return response.Success(c, http.StatusOK, dto.TransferStatusResponse{
		ID:     id,
		Status: string(document.StatusSubmitted),
	}, nil)
}

// ApproveTransfer handles POST /api/v1/transfers/{id}/approve (maker-checker).
func (h *TransferHandler) ApproveTransfer(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.ApproveTransfer(c.Request().Context(), id, userIDFromCtx(c)); err != nil {
		return writeUsecaseError(c, err, "Failed to approve transfer")
	}
	return response.Success(c, http.StatusOK, dto.TransferStatusResponse{
		ID:     id,
		Status: string(document.StatusApproved),
	}, nil)
}

// SendTransfer handles POST /api/v1/transfers/{id}/send (FR-5.1): issues the
// source warehouse FEFO/FIFO and books the goods as in_transit at the
// destination warehouse.
func (h *TransferHandler) SendTransfer(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	status, err := h.uc.SendTransfer(c.Request().Context(), id, userIDFromCtx(c))
	if err != nil {
		return writeUsecaseError(c, err, "Failed to send transfer")
	}
	return response.Success(c, http.StatusOK, dto.TransferStatusResponse{
		ID:     id,
		Status: string(status),
	}, nil)
}

// ReceiveTransfer handles POST /api/v1/transfers/{id}/receive (FR-5.1):
// confirms receipt at the destination, moves in_transit → available and logs
// any shortage as a discrepancy.
func (h *TransferHandler) ReceiveTransfer(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.ReceiveTransferRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	in := transferuc.ReceiveInput{UserID: userIDFromCtx(c)}
	for _, ln := range req.Lines {
		in.Lines = append(in.Lines, transferuc.ReceiveLineInput{
			LineID:      ln.LineID,
			QtyReceived: ln.QtyReceived,
			LocationID:  ln.LocationID,
			BatchID:     ln.BatchID,
			Notes:       ln.Notes,
		})
	}

	ipAddr := netip.MustParseAddr(c.RealIP())

	result, err := h.uc.ReceiveTransfer(c.Request().Context(), id, in, &ipAddr)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to receive transfer")
	}
	resp := dto.TransferStatusResponse{
		ID:          id,
		Status:      string(result.Status),
		Receipts:    []dto.TransferReceiptSummary{},
		Discrepancy: result.HasDiscrepancy,
	}
	for _, r := range result.Receipts {
		resp.Receipts = append(resp.Receipts, dto.TransferReceiptSummary{
			ID:          r.ID,
			LineID:      r.LineID,
			QtySent:     r.QtySent,
			QtyReceived: r.QtyReceived,
			Variance:    r.Variance,
			ReceivedBy:  r.ReceivedBy,
		})
	}
	return response.Success(c, http.StatusOK, resp, nil)
}

// transferDocumentResponse maps a TRF document into the API summary.
func transferDocumentResponse(doc *document.Document, lines []*document.DocumentLine) dto.TransferDocumentResponse {
	resp := dto.TransferDocumentResponse{
		ID:              doc.ID,
		PublicID:        doc.PublicID,
		DocNo:           doc.DocNo,
		DocType:         doc.DocType.String(),
		DocDate:         doc.DocDate.Format("2006-01-02"),
		Status:          doc.Status.String(),
		WarehouseID:     doc.WarehouseID,
		DestWarehouseID: doc.DestWarehouseID,
		Notes:           doc.Notes,
		CreatedBy:       doc.CreatedBy,
		Lines:           []dto.TransferLineSummary{},
	}
	for _, ln := range lines {
		resp.Lines = append(resp.Lines, dto.TransferLineSummary{
			ID:           ln.ID,
			LineNo:       ln.LineNo,
			ItemID:       ln.ItemID,
			Uom:          ln.Uom,
			QtyRequest:   ln.QtyRequest,
			QtyProcessed: ln.QtyProcessed,
		})
	}
	return resp
}
