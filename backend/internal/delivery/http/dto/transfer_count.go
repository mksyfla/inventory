package dto

// ─── Transfers (Fase 8.1 / FR-5.1) ───────────────────────────────────────────

// TransferLineRequest is one item row of a new transfer.
type TransferLineRequest struct {
	ItemID int64   `json:"item_id" validate:"required,gt=0"`
	Qty    float64 `json:"qty" validate:"required,gt=0"`
	Uom    string  `json:"uom" validate:"omitempty,max=20"`
	Notes  string  `json:"notes" validate:"omitempty,max=500"`
}

// CreateTransferRequest is the payload of POST /api/v1/transfers.
type CreateTransferRequest struct {
	WarehouseID     int64                 `json:"warehouse_id" validate:"required,gt=0"`
	DestWarehouseID int64                 `json:"dest_warehouse_id" validate:"required,gt=0"`
	IdempotencyKey  string                `json:"idempotency_key" validate:"omitempty,uuid4"`
	Notes           string                `json:"notes" validate:"omitempty,max=1000"`
	Lines           []TransferLineRequest `json:"lines" validate:"required,min=1,dive"`
}

// TransferLineSummary is one line of a transfer response.
type TransferLineSummary struct {
	ID           int64   `json:"id"`
	LineNo       int     `json:"line_no"`
	ItemID       int64   `json:"item_id"`
	Uom          string  `json:"uom"`
	QtyRequest   float64 `json:"qty_request"`
	QtyProcessed float64 `json:"qty_processed"`
}

// TransferDocumentResponse is the summary returned for a TRF document.
type TransferDocumentResponse struct {
	ID              int64                 `json:"id"`
	PublicID        string                `json:"public_id"`
	DocNo           string                `json:"doc_no"`
	DocType         string                `json:"doc_type"`
	DocDate         string                `json:"doc_date"`
	Status          string                `json:"status"`
	WarehouseID     int64                 `json:"warehouse_id"`
	DestWarehouseID *int64                `json:"dest_warehouse_id,omitempty"`
	Notes           *string               `json:"notes,omitempty"`
	CreatedBy       int64                 `json:"created_by"`
	Lines           []TransferLineSummary `json:"lines"`
}

// ReceiveLineRequest is one line receipt at the destination warehouse.
type ReceiveLineRequest struct {
	LineID      int64   `json:"line_id" validate:"required,gt=0"`
	QtyReceived float64 `json:"qty_received" validate:"required,gt=0"`
	LocationID  int64   `json:"location_id" validate:"required,gt=0"`
	BatchID     *int64  `json:"batch_id" validate:"omitempty,gt=0"`
	Notes       string  `json:"notes" validate:"omitempty,max=500"`
}

// ReceiveTransferRequest is the payload of POST /api/v1/transfers/{id}/receive.
type ReceiveTransferRequest struct {
	Lines []ReceiveLineRequest `json:"lines" validate:"required,min=1,dive"`
}

// TransferReceiptSummary is one recorded line receipt.
type TransferReceiptSummary struct {
	ID          int64   `json:"id"`
	LineID      int64   `json:"line_id"`
	QtySent     float64 `json:"qty_sent"`
	QtyReceived float64 `json:"qty_received"`
	Variance    float64 `json:"variance"`
	ReceivedBy  int64   `json:"received_by"`
}

// TransferStatusResponse is the result of transfer state-changing actions.
type TransferStatusResponse struct {
	ID         int64                   `json:"id"`
	Status     string                  `json:"status"`
	Receipts   []TransferReceiptSummary `json:"receipts,omitempty"`
	Discrepancy bool                   `json:"discrepancy,omitempty"`
}

// ─── Counts / Stock Opname (Fase 8.2 - 8.4 / FR-6.x) ─────────────────────────

// CreateCountRequest is the payload of POST /api/v1/counts (FR-6.1).
type CreateCountRequest struct {
	WarehouseID    int64   `json:"warehouse_id" validate:"required,gt=0"`
	Zone           string  `json:"zone" validate:"omitempty,max=20"`
	ItemIDs        []int64 `json:"item_ids" validate:"omitempty,dive,gt=0"`
	IdempotencyKey string  `json:"idempotency_key" validate:"omitempty,uuid4"`
	Notes          string  `json:"notes" validate:"omitempty,max=1000"`
}

// CountLineSummary is one snapshot line of a count session response.
// qty_system is intentionally omitted (Blind Count — FR-6.1).
type CountLineSummary struct {
	ID         int64    `json:"id"`
	ItemID     int64    `json:"item_id"`
	LocationID int64    `json:"location_id"`
	BatchID    *int64   `json:"batch_id,omitempty"`
	QtyCounted *float64 `json:"qty_counted,omitempty"`
	Variance   *float64 `json:"variance,omitempty"`
	ReasonCode *string  `json:"reason_code,omitempty"`
}

// CountDocumentResponse is the summary returned for a CNT document.
type CountDocumentResponse struct {
	ID          int64              `json:"id"`
	PublicID    string             `json:"public_id"`
	DocNo       string             `json:"doc_no"`
	DocType     string             `json:"doc_type"`
	DocDate     string             `json:"doc_date"`
	Status      string             `json:"status"`
	WarehouseID int64              `json:"warehouse_id"`
	Notes       *string            `json:"notes,omitempty"`
	CreatedBy   int64              `json:"created_by"`
	Lines       []CountLineSummary `json:"lines"`
}

// InputCountLineRequest is one field count of a snapshot line (FR-6.2).
// qty_counted=0 is a legitimate physical reading (barang habis/tidak ada),
// so the field is validated with gte=0 only — `required` would reject 0.
type InputCountLineRequest struct {
	CountLineID int64   `json:"count_line_id" validate:"required,gt=0"`
	QtyCounted  float64 `json:"qty_counted" validate:"gte=0"`
	ReasonCode  string  `json:"reason_code" validate:"omitempty,max=30"`
}

// InputCountLinesRequest is the payload of POST /api/v1/counts/{id}/lines.
type InputCountLinesRequest struct {
	Lines []InputCountLineRequest `json:"lines" validate:"required,min=1,dive"`
}

// PostCountRequest is the payload of POST /api/v1/counts/{id}/post (M6.4).
type PostCountRequest struct {
	ManagerApproverID *int64 `json:"manager_approver_id" validate:"omitempty,gt=0"`
}

// PostCountResponse summarizes the posted count session.
type PostCountResponse struct {
	ID                    int64   `json:"id"`
	Status                string  `json:"status"`
	TotalVariance         float64 `json:"total_variance"`
	TotalVarianceValue    float64 `json:"total_variance_value"`
	NeedsManagerApproval  bool    `json:"needs_manager_approval"`
	PostedAdjustmentLines int     `json:"posted_adjustment_lines"`
}

// ─── Manual Adjustments (Fase 8.5 / FR-6.5) ──────────────────────────────────

// AdjustmentLineRequest is one direct adjustment line.
type AdjustmentLineRequest struct {
	ItemID     int64   `json:"item_id" validate:"required,gt=0"`
	LocationID int64   `json:"location_id" validate:"required,gt=0"`
	BatchID    *int64  `json:"batch_id" validate:"omitempty,gt=0"`
	Qty        float64 `json:"qty" validate:"required"` // bertanda, != 0
	Status     string  `json:"status" validate:"omitempty,oneof=available damaged quarantine"`
	ReasonCode string  `json:"reason_code" validate:"omitempty,max=30"`
}

// CreateAdjustmentRequest is the payload of POST /api/v1/adjustments (FR-6.5).
type CreateAdjustmentRequest struct {
	WarehouseID    int64                  `json:"warehouse_id" validate:"required,gt=0"`
	ReasonCode     string                 `json:"reason_code" validate:"required,max=30"`
	Notes          string                 `json:"notes" validate:"required,max=1000"`
	IdempotencyKey string                 `json:"idempotency_key" validate:"omitempty,uuid4"`
	Lines          []AdjustmentLineRequest `json:"lines" validate:"required,min=1,dive"`
}

// AdjustmentDocumentResponse is the summary returned for an ADJ document.
type AdjustmentDocumentResponse struct {
	ID          int64   `json:"id"`
	PublicID    string  `json:"public_id"`
	DocNo       string  `json:"doc_no"`
	DocType     string  `json:"doc_type"`
	DocDate     string  `json:"doc_date"`
	Status      string  `json:"status"`
	WarehouseID int64   `json:"warehouse_id"`
	ReasonCode  *string `json:"reason_code,omitempty"`
	Notes       *string `json:"notes,omitempty"`
	CreatedBy   int64   `json:"created_by"`
}
