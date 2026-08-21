package handler

import (
	"net/http"
	"time"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/document"
	outbounduc "inventory/internal/usecase/outbound"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// OutboundHandler serves the outbound module (Fase 7): requests, delivery
// orders, FEFO/FIFO allocation, picking and proof-of-delivery.
type OutboundHandler struct {
	uc *outbounduc.OutboundUsecase
}

// NewOutboundHandler wires the outbound usecase to HTTP.
func NewOutboundHandler(uc *outbounduc.OutboundUsecase) *OutboundHandler {
	return &OutboundHandler{uc: uc}
}

// CreateRequest handles POST /api/v1/requests (Fase 7.1, FR-4.1).
func (h *OutboundHandler) CreateRequest(c echo.Context) error {
	var req dto.CreateRequestRequest
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

	in := outbounduc.CreateRequestInput{
		WarehouseID:    whID,
		PartnerID:      req.PartnerID,
		IdempotencyKey: req.IdempotencyKey,
		Notes:          req.Notes,
		CreatedBy:      userIDFromCtx(c),
	}
	for _, ln := range req.Lines {
		in.Lines = append(in.Lines, outbounduc.CreateLineInput{
			ItemID: ln.ItemID,
			Qty:    ln.Qty,
			Uom:    ln.Uom,
			Notes:  ln.Notes,
		})
	}

	doc, lines, err := h.uc.CreateRequest(c.Request().Context(), in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create request")
	}
	return response.Success(c, http.StatusCreated, requestDocumentResponse(doc, lines), nil)
}

// SubmitRequest handles POST /api/v1/requests/{id}/submit (FSD 4.4).
func (h *OutboundHandler) SubmitRequest(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.SubmitRequest(c.Request().Context(), id); err != nil {
		return writeUsecaseError(c, err, "Failed to submit request")
	}
	return response.Success(c, http.StatusOK, dto.OutboundStatusResponse{
		ID:     id,
		Status: string(document.StatusSubmitted),
	}, nil)
}

// ApproveRequest handles POST /api/v1/requests/{id}/approve (maker-checker).
func (h *OutboundHandler) ApproveRequest(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.ApproveRequest(c.Request().Context(), id, userIDFromCtx(c)); err != nil {
		return writeUsecaseError(c, err, "Failed to approve request")
	}
	return response.Success(c, http.StatusOK, dto.OutboundStatusResponse{
		ID:     id,
		Status: string(document.StatusApproved),
	}, nil)
}

// CreateDelivery handles POST /api/v1/deliveries (Fase 7.1, FR-4.1).
func (h *OutboundHandler) CreateDelivery(c echo.Context) error {
	var req dto.CreateDeliveryRequest
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

	doc, lines, err := h.uc.CreateDelivery(c.Request().Context(), outbounduc.CreateDeliveryInput{
		WarehouseID:    whID,
		RequestID:      req.RequestID,
		PartnerID:      req.PartnerID,
		IdempotencyKey: req.IdempotencyKey,
		Notes:          req.Notes,
		CreatedBy:      userIDFromCtx(c),
	})
	if err != nil {
		return writeUsecaseError(c, err, "Failed to create delivery order")
	}
	return response.Success(c, http.StatusCreated, deliveryDocumentResponse(doc, lines), nil)
}

// SubmitDelivery handles POST /api/v1/deliveries/{id}/submit (FSD 4.4).
func (h *OutboundHandler) SubmitDelivery(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.SubmitDelivery(c.Request().Context(), id); err != nil {
		return writeUsecaseError(c, err, "Failed to submit delivery order")
	}
	return response.Success(c, http.StatusOK, dto.OutboundStatusResponse{
		ID:     id,
		Status: string(document.StatusSubmitted),
	}, nil)
}

// ApproveDelivery handles POST /api/v1/deliveries/{id}/approve (maker-checker).
func (h *OutboundHandler) ApproveDelivery(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	if err := h.uc.ApproveDelivery(c.Request().Context(), id, userIDFromCtx(c)); err != nil {
		return writeUsecaseError(c, err, "Failed to approve delivery order")
	}
	return response.Success(c, http.StatusOK, dto.OutboundStatusResponse{
		ID:     id,
		Status: string(document.StatusApproved),
	}, nil)
}

// Allocate handles POST /api/v1/deliveries/{id}/allocate (FR-4.2).
func (h *OutboundHandler) Allocate(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.AllocateRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	in := outbounduc.AllocateInput{}
	for _, ln := range req.Lines {
		in.Lines = append(in.Lines, outbounduc.LineAllocInput{LineID: ln.LineID, Qty: ln.Qty})
	}
	results, err := h.uc.Allocate(c.Request().Context(), id, in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to allocate stock")
	}
	return response.Success(c, http.StatusOK, allocationResultsResponse(results), nil)
}

// AllocateOverride handles POST /api/v1/deliveries/{id}/allocate/override
// (Fase 7.3, requires outbound.override_allocation).
func (h *OutboundHandler) AllocateOverride(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.OverrideAllocateRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	in := outbounduc.OverrideInput{ReasonCode: req.ReasonCode}
	for _, ln := range req.Lines {
		in.Lines = append(in.Lines, outbounduc.OverrideLineInput{
			LineID:    ln.LineID,
			Qty:       ln.Qty,
			BalanceID: ln.BalanceID,
		})
	}
	results, err := h.uc.AllocateOverride(c.Request().Context(), id, in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to override allocation")
	}
	return response.Success(c, http.StatusOK, allocationResultsResponse(results), nil)
}

// PickingList handles GET /api/v1/deliveries/{id}/picking-list (FR-4.3).
func (h *OutboundHandler) PickingList(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	items, err := h.uc.PickingList(c.Request().Context(), id)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to build picking list")
	}
	if items == nil {
		items = []outbounduc.PickingListItem{}
	}
	out := make([]dto.PickingListItem, 0, len(items))
	for _, it := range items {
		out = append(out, dto.PickingListItem{
			AllocationID: it.AllocationID,
			LineID:       it.LineID,
			ItemID:       it.ItemID,
			SKU:          it.SKU,
			BaseUom:      it.BaseUom,
			LocationCode: it.LocationCode,
			PickSeq:      it.PickSeq,
			BatchID:      it.BatchID,
			BatchNo:      it.BatchNo,
			QtyAllocated: it.QtyAllocated,
			QtyPicked:    it.QtyPicked,
			QtyRemaining: it.QtyRemaining,
		})
	}
	return response.Success(c, http.StatusOK, out, nil)
}

// Pick handles POST /api/v1/deliveries/{id}/pick (FR-4.4).
func (h *OutboundHandler) Pick(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.PickRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	in := outbounduc.PickInput{}
	for _, sc := range req.Scans {
		in.Scans = append(in.Scans, outbounduc.PickScanInput{
			AllocationID:    sc.AllocationID,
			LocationBarcode: sc.LocationBarcode,
			ItemBarcode:     sc.ItemBarcode,
			Qty:             sc.Qty,
		})
	}
	if err := h.uc.Pick(c.Request().Context(), id, in); err != nil {
		return writeUsecaseError(c, err, "Failed to confirm picking")
	}
	return response.Success(c, http.StatusOK, dto.OutboundStatusResponse{
		ID:     id,
		Status: "picked",
	}, nil)
}

// Ship handles POST /api/v1/deliveries/{id}/ship (FR-4.5).
func (h *OutboundHandler) Ship(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.ShipRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	status, err := h.uc.Ship(c.Request().Context(), id, outbounduc.ShipInput{
		VehicleNo:  req.VehicleNo,
		DriverName: req.DriverName,
	})
	if err != nil {
		return writeUsecaseError(c, err, "Failed to post shipment")
	}
	return response.Success(c, http.StatusOK, dto.OutboundStatusResponse{
		ID:     id,
		Status: string(status),
	}, nil)
}

// Pod handles POST /api/v1/deliveries/{id}/pod (FR-4.6).
func (h *OutboundHandler) Pod(c echo.Context) error {
	id, ok := pathIDParam(c, "id")
	if !ok {
		return nil
	}
	var req dto.PodRequest
	if !bindAndValidate(c, &req) {
		return nil
	}
	in := outbounduc.PodInput{
		ReceivedBy:   req.ReceivedBy,
		PodFileURL:   req.PodFileURL,
		SignatureURL: req.SignatureURL,
	}
	if req.ReceivedAt != nil {
		t, err := time.Parse(time.RFC3339, *req.ReceivedAt)
		if err != nil {
			return response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION",
				"Invalid request payload",
				[]response.ErrorDetail{{Field: "received_at", Message: "must be a valid RFC3339 timestamp"}}, "")
		}
		in.ReceivedAt = &t
	}
	status, err := h.uc.Pod(c.Request().Context(), id, in)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to record proof of delivery")
	}
	return response.Success(c, http.StatusOK, dto.OutboundStatusResponse{
		ID:     id,
		Status: string(status),
	}, nil)
}

// requestDocumentResponse maps a REQ document into the API summary.
func requestDocumentResponse(doc *document.Document, lines []*document.DocumentLine) dto.RequestDocumentResponse {
	resp := dto.RequestDocumentResponse{
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
		Lines:       []dto.RequestLineSummary{},
	}
	for _, ln := range lines {
		resp.Lines = append(resp.Lines, dto.RequestLineSummary{
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

// deliveryDocumentResponse maps a DO document into the API summary.
func deliveryDocumentResponse(doc *document.Document, lines []*document.DocumentLine) dto.DeliveryDocumentResponse {
	resp := dto.DeliveryDocumentResponse{
		ID:          doc.ID,
		PublicID:    doc.PublicID,
		DocNo:       doc.DocNo,
		DocType:     doc.DocType.String(),
		DocDate:     doc.DocDate.Format("2006-01-02"),
		Status:      doc.Status.String(),
		WarehouseID: doc.WarehouseID,
		RequestID:   doc.RefDocID,
		PartnerID:   doc.PartnerID,
		Notes:       doc.Notes,
		CreatedBy:   doc.CreatedBy,
		Lines:       []dto.DeliveryLineSummary{},
	}
	for _, ln := range lines {
		resp.Lines = append(resp.Lines, dto.DeliveryLineSummary{
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

// allocationResultsResponse flattens allocation results into the API shape.
func allocationResultsResponse(results []outbounduc.AllocationResult) []dto.AllocationResult {
	out := make([]dto.AllocationResult, 0, len(results))
	for _, r := range results {
		out = append(out, dto.AllocationResult{
			LineID:       r.LineID,
			AllocationID: r.AllocationID,
			BalanceID:    r.BalanceID,
			LocationCode: r.LocationCode,
			BatchID:      r.BatchID,
			QtyAllocated: r.QtyAllocated,
		})
	}
	return out
}
