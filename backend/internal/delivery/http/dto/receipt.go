package dto

// ReceiptLineRequest is one item row of a GRN (Fase 6, FR-2.1).
type ReceiptLineRequest struct {
	ItemID     int64   `json:"item_id" validate:"required,gt=0"`
	Qty        float64 `json:"qty" validate:"required,gt=0"`
	Uom        string  `json:"uom" validate:"omitempty,max=20"`
	BatchNo    string  `json:"batch_no" validate:"omitempty,max=60"`
	ExpiryDate *string `json:"expiry_date" validate:"omitempty,datetime=2006-01-02"`
	Status     string  `json:"status" validate:"omitempty,oneof=available quarantine damaged"`
	Notes      string  `json:"notes" validate:"omitempty,max=500"`
}

// CreateReceiptRequest is the payload of POST /api/v1/receipts.
type CreateReceiptRequest struct {
	WarehouseID    int64                `json:"warehouse_id" validate:"required,gt=0"`
	PartnerID      *int64               `json:"partner_id" validate:"omitempty,gt=0"`
	IdempotencyKey string               `json:"idempotency_key" validate:"omitempty,uuid4"`
	Notes          string               `json:"notes" validate:"omitempty,max=1000"`
	Lines          []ReceiptLineRequest `json:"lines" validate:"required,min=1,dive"`
}

// PutawayScanRequest is one scanned putaway action (FR-2.5).
type PutawayScanRequest struct {
	LineID       int64   `json:"line_id" validate:"required,gt=0"`
	Qty          float64 `json:"qty" validate:"required,gt=0"`
	LocationCode string  `json:"location_code" validate:"required,max=30"`
}

// PutawayRequest is the payload of POST /api/v1/receipts/{id}/putaway.
type PutawayRequest struct {
	Lines []PutawayScanRequest `json:"lines" validate:"required,min=1,dive"`
}

// ReceiptDocumentResponse is the summary returned for a GRN document.
type ReceiptDocumentResponse struct {
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
	Lines       []ReceiptLineSummary `json:"lines"`
}

// ReceiptLineSummary is one line of a GRN response.
type ReceiptLineSummary struct {
	ID           int64   `json:"id"`
	LineNo       int     `json:"line_no"`
	ItemID       int64   `json:"item_id"`
	Uom          string  `json:"uom"`
	QtyRequest   float64 `json:"qty_request"`
	QtyProcessed float64 `json:"qty_processed"`
	BatchID      *int64  `json:"batch_id,omitempty"`
	LocationID   *int64  `json:"location_id,omitempty"`
	Status       string  `json:"status"`
}

// ReceiptStatusResponse is the result of state-changing receipt actions.
type ReceiptStatusResponse struct {
	ID     int64  `json:"id"`
	Status string `json:"status"`
}
