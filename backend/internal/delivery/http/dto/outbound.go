package dto

// ─── Requests (Fase 7.1) ─────────────────────────────────────────────────────

// RequestLineRequest is one item row of a new request.
type RequestLineRequest struct {
	ItemID int64   `json:"item_id" validate:"required,gt=0"`
	Qty    float64 `json:"qty" validate:"required,gt=0"`
	Uom    string  `json:"uom" validate:"omitempty,max=20"`
	Notes  string  `json:"notes" validate:"omitempty,max=500"`
}

// CreateRequestRequest is the payload of POST /api/v1/requests.
type CreateRequestRequest struct {
	WarehouseID    int64                `json:"warehouse_id" validate:"required,gt=0"`
	PartnerID      *int64               `json:"partner_id" validate:"omitempty,gt=0"`
	IdempotencyKey string               `json:"idempotency_key" validate:"omitempty,uuid4"`
	Notes          string               `json:"notes" validate:"omitempty,max=1000"`
	Lines          []RequestLineRequest `json:"lines" validate:"required,min=1,dive"`
}

// RequestLineSummary is one line of a request response.
type RequestLineSummary struct {
	ID           int64   `json:"id"`
	LineNo       int     `json:"line_no"`
	ItemID       int64   `json:"item_id"`
	Uom          string  `json:"uom"`
	QtyRequest   float64 `json:"qty_request"`
	QtyProcessed float64 `json:"qty_processed"`
}

// RequestDocumentResponse is the summary returned for a request document.
type RequestDocumentResponse struct {
	ID          int64                `json:"id"`
	PublicID    string               `json:"public_id"`
	DocNo       string               `json:"doc_no"`
	DocType     string               `json:"doc_type"`
	DocDate     string               `json:"doc_date"`
	Status      string               `json:"status"`
	WarehouseID int64                `json:"warehouse_id"`
	PartnerID   *int64               `json:"partner_id,omitempty"`
	Notes       *string              `json:"notes,omitempty"`
	CreatedBy   int64                `json:"created_by"`
	Lines       []RequestLineSummary `json:"lines"`
}

// ─── Delivery Orders (Fase 7.1) ──────────────────────────────────────────────

// CreateDeliveryRequest is the payload of POST /api/v1/deliveries.
type CreateDeliveryRequest struct {
	WarehouseID    int64   `json:"warehouse_id" validate:"required,gt=0"`
	RequestID      int64   `json:"request_id" validate:"required,gt=0"`
	PartnerID      *int64  `json:"partner_id" validate:"omitempty,gt=0"`
	IdempotencyKey string  `json:"idempotency_key" validate:"omitempty,uuid4"`
	Notes          string  `json:"notes" validate:"omitempty,max=1000"`
}

// DeliveryLineSummary is one line of a DO response.
type DeliveryLineSummary struct {
	ID           int64   `json:"id"`
	LineNo       int     `json:"line_no"`
	ItemID       int64   `json:"item_id"`
	Uom          string  `json:"uom"`
	QtyRequest   float64 `json:"qty_request"`
	QtyProcessed float64 `json:"qty_processed"`
}

// DeliveryDocumentResponse is the summary returned for a DO document.
type DeliveryDocumentResponse struct {
	ID          int64                  `json:"id"`
	PublicID    string                 `json:"public_id"`
	DocNo       string                 `json:"doc_no"`
	DocType     string                 `json:"doc_type"`
	DocDate     string                 `json:"doc_date"`
	Status      string                 `json:"status"`
	WarehouseID int64                  `json:"warehouse_id"`
	RequestID   *int64                 `json:"request_id,omitempty"`
	PartnerID   *int64                 `json:"partner_id,omitempty"`
	Notes       *string                `json:"notes,omitempty"`
	CreatedBy   int64                  `json:"created_by"`
	Lines       []DeliveryLineSummary  `json:"lines"`
}

// ─── Allocation (Fase 7.2 / 7.3) ─────────────────────────────────────────────

// AllocateLineRequest requests allocation of one document line.
type AllocateLineRequest struct {
	LineID int64   `json:"line_id" validate:"required,gt=0"`
	Qty    float64 `json:"qty" validate:"required,gt=0"`
}

// AllocateRequest is the payload of POST /api/v1/deliveries/{id}/allocate.
type AllocateRequest struct {
	Lines []AllocateLineRequest `json:"lines" validate:"required,min=1,dive"`
}

// OverrideLineRequest is one manual allocation targeting a specific balance.
type OverrideLineRequest struct {
	LineID    int64   `json:"line_id" validate:"required,gt=0"`
	Qty       float64 `json:"qty" validate:"required,gt=0"`
	BalanceID int64   `json:"balance_id" validate:"required,gt=0"`
}

// OverrideAllocateRequest is the payload of
// POST /api/v1/deliveries/{id}/allocate/override (Fase 7.3).
type OverrideAllocateRequest struct {
	ReasonCode string                `json:"reason_code" validate:"required,max=30"`
	Lines      []OverrideLineRequest `json:"lines" validate:"required,min=1,dive"`
}

// AllocationResult is one allocation returned by the allocate endpoints.
type AllocationResult struct {
	LineID       int64   `json:"line_id"`
	AllocationID int64   `json:"allocation_id"`
	BalanceID    int64   `json:"balance_id"`
	LocationCode string  `json:"location_code"`
	BatchID      *int64  `json:"batch_id,omitempty"`
	QtyAllocated float64 `json:"qty_allocated"`
}

// ─── Picking list (Fase 7.4) ─────────────────────────────────────────────────

// PickingListItem is one picking list row ordered by pick_seq.
type PickingListItem struct {
	AllocationID int64   `json:"allocation_id"`
	LineID       int64   `json:"line_id"`
	ItemID       int64   `json:"item_id"`
	SKU          string  `json:"sku"`
	BaseUom      string  `json:"base_uom"`
	LocationCode string  `json:"location_code"`
	PickSeq      *int    `json:"pick_seq,omitempty"`
	BatchID      *int64  `json:"batch_id,omitempty"`
	BatchNo      string  `json:"batch_no,omitempty"`
	QtyAllocated float64 `json:"qty_allocated"`
	QtyPicked    float64 `json:"qty_picked"`
	QtyRemaining float64 `json:"qty_remaining"`
}

// ─── Pick (Fase 7.5) ─────────────────────────────────────────────────────────

// PickScanRequest is one scanned picking action.
type PickScanRequest struct {
	AllocationID    int64   `json:"allocation_id" validate:"required,gt=0"`
	LocationBarcode string  `json:"location_barcode" validate:"required,max=30"`
	ItemBarcode     string  `json:"item_barcode" validate:"required,max=64"`
	Qty             float64 `json:"qty" validate:"required,gt=0"`
}

// PickRequest is the payload of POST /api/v1/deliveries/{id}/pick.
type PickRequest struct {
	Scans []PickScanRequest `json:"scans" validate:"required,min=1,dive"`
}

// ─── Ship (Fase 7.6) ─────────────────────────────────────────────────────────

// ShipRequest is the payload of POST /api/v1/deliveries/{id}/ship.
type ShipRequest struct {
	VehicleNo  string `json:"vehicle_no" validate:"omitempty,max=20"`
	DriverName string `json:"driver_name" validate:"omitempty,max=100"`
}

// ─── POD (Fase 7.7) ──────────────────────────────────────────────────────────

// PodRequest is the payload of POST /api/v1/deliveries/{id}/pod.
type PodRequest struct {
	ReceivedBy   string  `json:"received_by" validate:"required,max=100"`
	ReceivedAt   *string `json:"received_at" validate:"omitempty,datetime=2006-01-02T15:04:05Z07:00"`
	PodFileURL   string  `json:"pod_file_url" validate:"omitempty,max=1000"`
	SignatureURL string  `json:"signature_url" validate:"omitempty,max=1000"`
}

// OutboundStatusResponse is the result of state-changing outbound actions.
type OutboundStatusResponse struct {
	ID     int64  `json:"id"`
	Status string `json:"status"`
}
