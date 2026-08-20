package dto

// ============ ITEM DTOs ============

type ItemUoMInput struct {
	Uom        string  `json:"uom" validate:"required,min=1,max=20"`
	ConvFactor float64 `json:"conv_factor" validate:"required,gt=0"`
	Barcode    *string `json:"barcode" validate:"omitempty,max=64"`
}

type CreateItemRequest struct {
	Sku          string         `json:"sku" validate:"required,min=1,max=50"`
	Name         string         `json:"name" validate:"required,min=1,max=150"`
	CategoryID   *int64         `json:"category_id" validate:"omitempty,gt=0"`
	BaseUom      string         `json:"base_uom" validate:"required,min=1,max=20"`
	IsBatch      bool           `json:"is_batch"`
	IsExpiry     bool           `json:"is_expiry"`
	IsSerial     bool           `json:"is_serial"`
	MinQty       float64        `json:"min_qty" validate:"gte=0"`
	MaxQty       *float64       `json:"max_qty" validate:"omitempty,gte=0,gtefield=MinQty"`
	SafetyStock  float64        `json:"safety_stock" validate:"gte=0"`
	LeadTimeDays int16          `json:"lead_time_days" validate:"gte=0"`
	AbcClass     *string        `json:"abc_class" validate:"omitempty,oneof=A B C"`
	UoMs         []ItemUoMInput `json:"uoms" validate:"omitempty,dive"`
}

type UpdateItemRequest struct {
	Name         string   `json:"name" validate:"required,min=1,max=150"`
	CategoryID   *int64   `json:"category_id" validate:"omitempty,gt=0"`
	BaseUom      string   `json:"base_uom" validate:"required,min=1,max=20"`
	IsBatch      bool     `json:"is_batch"`
	IsExpiry     bool     `json:"is_expiry"`
	IsSerial     bool     `json:"is_serial"`
	MinQty       float64  `json:"min_qty" validate:"gte=0"`
	MaxQty       *float64 `json:"max_qty" validate:"omitempty,gte=0,gtefield=MinQty"`
	SafetyStock  float64  `json:"safety_stock" validate:"gte=0"`
	LeadTimeDays int16    `json:"lead_time_days" validate:"gte=0"`
	AbcClass     *string  `json:"abc_class" validate:"omitempty,oneof=A B C"`
	IsActive     bool     `json:"is_active"`
}

// ============ LOCATION DTOs ============

type CreateLocationRequest struct {
	WarehouseID int64    `json:"warehouse_id" validate:"required,gt=0"`
	Code        string   `json:"code" validate:"required,min=1,max=30"`
	Zone        *string  `json:"zone" validate:"omitempty,max=20"`
	Rack        *string  `json:"rack" validate:"omitempty,max=20"`
	Level       *string  `json:"level" validate:"omitempty,max=20"`
	LocType     string   `json:"loc_type" validate:"required,oneof=staging pick bulk quarantine damaged transit"`
	PickSeq     *int32   `json:"pick_seq" validate:"omitempty,gte=0"`
	Capacity    *float64 `json:"capacity" validate:"omitempty,gte=0"`
}

// ============ PARTNER DTOs ============

type CreatePartnerRequest struct {
	Code         string `json:"code" validate:"required,min=1,max=30"`
	PartnerType  string `json:"partner_type" validate:"required,oneof=supplier customer internal_unit"`
	Name         string `json:"name" validate:"required,min=1,max=150"`
	Address      string `json:"address" validate:"omitempty,max=500"`
	ContactName  string `json:"contact_name" validate:"omitempty,max=100"`
	ContactPhone string `json:"contact_phone" validate:"omitempty,max=30"`
}

// UpdatePartnerRequest is the body for PATCH /partners/:id. The frontend
// always submits the full partner form, so fields mirror CreatePartnerRequest
// plus is_active (the edit modal lets the user toggle partner status).
type UpdatePartnerRequest struct {
	Code         string `json:"code" validate:"required,min=1,max=30"`
	PartnerType  string `json:"partner_type" validate:"required,oneof=supplier customer internal_unit"`
	Name         string `json:"name" validate:"required,min=1,max=150"`
	Address      string `json:"address" validate:"omitempty,max=500"`
	ContactName  string `json:"contact_name" validate:"omitempty,max=100"`
	ContactPhone string `json:"contact_phone" validate:"omitempty,max=30"`
	IsActive     bool   `json:"is_active"`
}

// ============ IMPORT DTOs ============

type ImportJobResponse struct {
	JobID  string `json:"job_id"`
	Status string `json:"status"`
}
