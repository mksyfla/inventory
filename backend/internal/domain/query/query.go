// Package query defines the read-only domain models and repository interface
// behind the shared GET endpoints (document lists/detail, stock, admin,
// reports and dashboard). It intentionally carries no write logic — those
// flows live in their own usecase packages.
package query

import (
	"context"
	"encoding/json"
	"time"
)

// DocumentFilter selects the document rows to list. DocType/Status use the
// "" = no-filter convention; WarehouseID uses 0 = no filter.
type DocumentFilter struct {
	DocType     string
	Status      string
	WarehouseID int64
	Limit       int
	Offset      int
}

// DocumentSummary is the list-level view of a document row (GRN/REQ/DO/TRF/
// CNT/ADJ) shared by all document list endpoints.
type DocumentSummary struct {
	ID                 int64      `json:"id"`
	PublicID           string     `json:"public_id"`
	DocNo              string     `json:"doc_no"`
	DocType            string     `json:"doc_type"`
	DocDate            string     `json:"doc_date"` // YYYY-MM-DD
	Status             string     `json:"status"`
	WarehouseID        int64      `json:"warehouse_id"`
	DestWarehouseID    *int64     `json:"dest_warehouse_id"`
	PartnerID          *int64     `json:"partner_id"`
	ReasonCode         string     `json:"reason_code"`
	Notes              string     `json:"notes"`
	CreatedAt          time.Time  `json:"created_at"`
	CreatedBy          int64      `json:"created_by"`
	SubmittedAt        *time.Time `json:"submitted_at"`
	ApprovedAt         *time.Time `json:"approved_at"`
	ApprovedBy         *int64     `json:"approved_by"`
	CompletedAt        *time.Time `json:"completed_at"`
	ManagerApprovedBy  *int64     `json:"manager_approved_by"`
	ManagerApprovedAt  *time.Time `json:"manager_approved_at"`
	// Joined master references so the list pages render without extra lookups.
	WarehouseCode     string `json:"warehouse_code"`
	WarehouseName     string `json:"warehouse_name"`
	DestWarehouseCode string `json:"dest_warehouse_code"`
	DestWarehouseName string `json:"dest_warehouse_name"`
	PartnerCode       string `json:"partner_code"`
	PartnerName       string `json:"partner_name"`
	RefDocNo          string `json:"ref_doc_no"`
	LineCount         int64  `json:"line_count"`
}

// DocumentLine is one line of a document detail, joined with its item master.
type DocumentLine struct {
	ID           int64   `json:"id"`
	DocumentID   int64   `json:"document_id"`
	LineNo       int     `json:"line_no"`
	ItemID       int64   `json:"item_id"`
	SKU          string  `json:"sku"`
	ItemName     string  `json:"item_name"`
	Uom          string  `json:"uom"`
	ConvFactor   float64 `json:"conv_factor"`
	QtyRequest   float64 `json:"qty_request"`
	QtyProcessed float64 `json:"qty_processed"`
	BatchID      *int64  `json:"batch_id"`
	LocationID   *int64  `json:"location_id"`
	Status       string  `json:"status"`
	Notes        string  `json:"notes"`
}

// WarehouseRef is the master reference joined onto a document (source or dest).
type WarehouseRef struct {
	ID       int64  `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

// PartnerRef is the partner/supplier reference joined onto a document.
type PartnerRef struct {
	ID          int64  `json:"id"`
	Code        string `json:"code"`
	PartnerType string `json:"partner_type"`
	Name        string `json:"name"`
	IsActive    bool   `json:"is_active"`
}

// DocumentDetail is the header + joined references + lines for GET .../{id}.
type DocumentDetail struct {
	ID                int64           `json:"id"`
	PublicID          string          `json:"public_id"`
	DocNo             string          `json:"doc_no"`
	DocType           string          `json:"doc_type"`
	DocDate           string          `json:"doc_date"`
	Status            string          `json:"status"`
	WarehouseID       int64           `json:"warehouse_id"`
	DestWarehouseID   *int64          `json:"dest_warehouse_id"`
	PartnerID         *int64          `json:"partner_id"`
	ReasonCode        string          `json:"reason_code"`
	Notes             string          `json:"notes"`
	CreatedAt         time.Time       `json:"created_at"`
	CreatedBy         int64           `json:"created_by"`
	SubmittedAt       *time.Time      `json:"submitted_at"`
	ApprovedAt        *time.Time      `json:"approved_at"`
	ApprovedBy        *int64          `json:"approved_by"`
	CompletedAt       *time.Time      `json:"completed_at"`
	ManagerApprovedBy *int64          `json:"manager_approved_by"`
	ManagerApprovedAt *time.Time      `json:"manager_approved_at"`
	SourceWarehouse   *WarehouseRef   `json:"source_warehouse,omitempty"`
	DestWarehouse     *WarehouseRef   `json:"dest_warehouse,omitempty"`
	Partner           *PartnerRef     `json:"partner,omitempty"`
	Lines             []DocumentLine  `json:"lines"`
	// Flat joined references mirror DocumentSummary so list/detail share fields.
	WarehouseCode     string `json:"warehouse_code"`
	WarehouseName     string `json:"warehouse_name"`
	DestWarehouseCode string `json:"dest_warehouse_code"`
	DestWarehouseName string `json:"dest_warehouse_name"`
	PartnerCode       string `json:"partner_code"`
	PartnerName       string `json:"partner_name"`
	RefDocNo          string `json:"ref_doc_no"`
	LineCount         int64  `json:"line_count"`
}

// StockBalanceFilter selects stock balance rows. All text filters use the
// "" = no-filter convention; CategoryID uses 0 = no filter. WarehouseCode
// comes from the mandatory X-Warehouse-Id header ("" = all warehouses).
type StockBalanceFilter struct {
	WarehouseCode string
	Status        string
	Search        string
	CategoryID    int64
}

// StockBalance is one stock_balances row joined with item/location/batch.
type StockBalance struct {
	BalanceID    int64     `json:"balance_id"`
	ItemID       int64     `json:"item_id"`
	SKU          string    `json:"sku"`
	ItemName     string    `json:"item_name"`
	BaseUom      string    `json:"base_uom"`
	CategoryName string    `json:"category_name"`
	WarehouseID  int64     `json:"warehouse_id"`
	WarehouseName string   `json:"warehouse_name"`
	LocationID   int64     `json:"location_id"`
	LocationCode string    `json:"location_code"`
	Zone         string    `json:"zone"`
	Rack         string    `json:"rack"`
	Level        string    `json:"level"`
	BatchID      *int64    `json:"batch_id"`
	BatchNo      string    `json:"batch_no"`
	ExpiryDate   string    `json:"expiry_date"` // YYYY-MM-DD
	Status       string    `json:"status"`
	QtyOnhand    float64   `json:"qty_onhand"`
	QtyReserved  float64   `json:"qty_reserved"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// BatchTrace is one batch row with its current balance/location (if any),
// plus the earliest GRN that introduced it (for backward traceability).
type BatchTrace struct {
	BatchID      int64   `json:"batch_id"`
	BatchNo      string  `json:"batch_no"`
	ItemID       int64   `json:"item_id"`
	SKU          string  `json:"sku"`
	ItemName     string  `json:"item_name"`
	BaseUom      string  `json:"base_uom"`
	MfgDate      string  `json:"mfg_date"`   // YYYY-MM-DD
	ExpiryDate   string  `json:"expiry_date"` // YYYY-MM-DD
	BalanceID    *int64  `json:"balance_id"`
	LocationID   *int64  `json:"location_id"`
	LocationCode string  `json:"location_code"`
	Status       string  `json:"status"`
	QtyOnhand    float64 `json:"qty_onhand"`
	QtyReserved  float64 `json:"qty_reserved"`
	GrnNo        string  `json:"grn_no"`
	GrnDate      string  `json:"grn_date"` // YYYY-MM-DD
	SupplierName string  `json:"supplier_name"`
}

// StockLedgerFilter selects immutable stock movement rows. ItemID uses 0 = no
// filter; MovedAt is constrained to [From, To].
type StockLedgerFilter struct {
	ItemID int64
	From   time.Time
	To     time.Time
	Limit  int
	Offset int
}

// StockLedgerRow is one stock_movements row joined with item/location/batch/user
// so the stock card page can render without extra lookups.
type StockLedgerRow struct {
	ID           int64     `json:"id"`
	MovedAt      time.Time `json:"moved_at"`
	ItemID       int64     `json:"item_id"`
	SKU          string    `json:"sku"`
	ItemName     string    `json:"item_name"`
	BaseUom      string    `json:"base_uom"`
	LocationID   int64     `json:"location_id"`
	LocationCode string    `json:"location_code"`
	BatchID      *int64    `json:"batch_id"`
	BatchNo      string    `json:"batch_no"`
	Status       string    `json:"status"`
	MovementType string    `json:"movement_type"`
	Qty          float64   `json:"qty"`
	QtyAfter     float64   `json:"qty_after"`
	DocNo        string    `json:"doc_no"`
	CreatedBy    int64     `json:"created_by"`
	OperatorName string    `json:"operator_name"`
}

// CountLineDetail is one doc.count_lines row joined with item/location/batch
// for the count session detail view (GET /counts/{id}). qty_system is only set
// in the supervisor reconciliation view; the blind-count field screen requests
// ?blind=1 and receives nil here so the system quantity never leaves the
// server (FR-6.1 / FR-6.2).
type CountLineDetail struct {
	ID           int64      `json:"id"`
	ItemID       int64      `json:"item_id"`
	SKU          string     `json:"sku"`
	ItemName     string     `json:"item_name"`
	Uom          string     `json:"uom"`
	LocationID   int64      `json:"location_id"`
	LocationCode string     `json:"location_code"`
	BatchID      *int64     `json:"batch_id,omitempty"`
	BatchNo      string     `json:"batch_no"`
	ExpiryDate   string     `json:"expiry_date"` // YYYY-MM-DD
	QtySystem    *float64   `json:"qty_system,omitempty"`
	QtyCounted   *float64   `json:"qty_counted,omitempty"`
	Variance     *float64   `json:"variance,omitempty"`
	ReasonCode   string     `json:"reason_code"`
	CountedBy    *int64     `json:"counted_by,omitempty"`
	CountedAt    *time.Time `json:"counted_at,omitempty"`
}

// CountDocumentDetail is the CNT header + snapshot lines for GET /counts/{id}.
type CountDocumentDetail struct {
	ID            int64             `json:"id"`
	PublicID      string            `json:"public_id"`
	DocNo         string            `json:"doc_no"`
	DocType       string            `json:"doc_type"`
	DocDate       string            `json:"doc_date"` // YYYY-MM-DD
	Status        string            `json:"status"`
	WarehouseID   int64             `json:"warehouse_id"`
	Notes         string            `json:"notes"`
	CreatedAt     time.Time         `json:"created_at"`
	CreatedBy     int64             `json:"created_by"`
	WarehouseCode  string            `json:"warehouse_code"`
	WarehouseName  string            `json:"warehouse_name"`
	Lines          []CountLineDetail `json:"lines"`
}

// Warehouse is the master warehouse row used by the warehouse dropdown.
type Warehouse struct {
	ID       int64  `json:"id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	Address  string `json:"address"`
	IsActive bool   `json:"is_active"`
}

// UserSummary is a sec.users row with its role codes and warehouse codes.
type UserSummary struct {
	ID           int64      `json:"id"`
	Username     string     `json:"username"`
	Email        string     `json:"email"`
	FullName     string     `json:"full_name"`
	Phone        string     `json:"phone"`
	IsActive     bool       `json:"is_active"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	Roles        []string   `json:"roles"`
	Warehouses   []string   `json:"warehouses"`
	WarehouseIDs []int64    `json:"warehouse_ids"`
}

// RoleSummary is a sec.roles row with its permission codes.
type RoleSummary struct {
	ID          int64    `json:"id"`
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

// PermissionSummary is one sec.permissions row (for the role permission matrix).
type PermissionSummary struct {
	ID   int64  `json:"id"`
	Code string `json:"code"`
}

// AuditLog is one aud.audit_logs row with the actor username joined in.
type AuditLog struct {
	ID            int64           `json:"id"`
	OccurredAt    time.Time       `json:"occurred_at"`
	UserID        *int64          `json:"user_id"`
	ActorUsername string          `json:"actor_username"`
	Action        string          `json:"action"`
	Entity        string          `json:"entity"`
	EntityID      *int64          `json:"entity_id"`
	OldValue      json.RawMessage `json:"old_value"`
	NewValue      json.RawMessage `json:"new_value"`
	IPAddress     string          `json:"ip_address"`
	RequestID     string          `json:"request_id"`
}

// FsnReportRow is one FSN analysis row (velocity classification per item).
type FsnReportRow struct {
	ID               int64     `json:"id"`
	SKU              string    `json:"sku"`
	ItemName         string    `json:"item_name"`
	CategoryName     string    `json:"category_name"`
	BaseUom          string    `json:"base_uom"`
	LastMovementDate time.Time `json:"last_movement_date"`
	FsnCategory      string    `json:"fsn_category"`
	TurnoverRatio    int       `json:"turnover_ratio"`
	CurrentQty       float64   `json:"current_qty"`
	TotalValuation   float64   `json:"total_valuation"`
}

// ValuationReportRow is one inventory valuation row (ending balance x last cost).
type ValuationReportRow struct {
	ID            int64   `json:"id"`
	SKU           string  `json:"sku"`
	ItemName      string  `json:"item_name"`
	CategoryName  string  `json:"category_name"`
	Uom           string  `json:"uom"`
	UnitPrice     float64 `json:"unit_price"`
	EndingQty     float64 `json:"ending_qty"`
	EndingValue   float64 `json:"ending_value"`
	InboundQty    float64 `json:"inbound_qty"`
	InboundValue  float64 `json:"inbound_value"`
	OutboundQty   float64 `json:"outbound_qty"`
	OutboundValue float64 `json:"outbound_value"`
}

// SpaceUtilizationRow is one warehouse location with its volume utilization.
type SpaceUtilizationRow struct {
	WarehouseID      int64   `json:"warehouse_id"`
	WarehouseCode    string  `json:"warehouse_code"`
	WarehouseName    string  `json:"warehouse_name"`
	LocationID       int64   `json:"location_id"`
	LocationCode     string  `json:"location_code"`
	ZoneName         string  `json:"zone_name"`
	LocType          string  `json:"loc_type"`
	CapacityVolumeM3 float64 `json:"capacity_volume_m3"`
	UsedVolumeM3     float64 `json:"used_volume_m3"`
}

// DashboardSummary is the operational KPI card summary.
type DashboardSummary struct {
	GrnToday       int64   `json:"grn_today"`
	DoToday        int64   `json:"do_today"`
	ReqOpen        int64   `json:"req_open"`
	DoOpen         int64   `json:"do_open"`
	BelowMinItems  int64   `json:"below_min_items"`
	TotalValuation float64 `json:"total_valuation"`
}

// Repository is the read-only store backing the shared GET endpoints.
type Repository interface {
	ListDocuments(ctx context.Context, f DocumentFilter) ([]DocumentSummary, error)
	GetDocumentDetail(ctx context.Context, id int64) (*DocumentDetail, error)
	GetCountDocumentDetail(ctx context.Context, id int64, blind bool) (*CountDocumentDetail, error)
	ListStockBalances(ctx context.Context, f StockBalanceFilter) ([]StockBalance, error)
	ListBatchTrace(ctx context.Context, search string) ([]BatchTrace, error)
	ListStockLedger(ctx context.Context, f StockLedgerFilter) ([]StockLedgerRow, error)
	ListWarehouses(ctx context.Context) ([]Warehouse, error)
	ListUsers(ctx context.Context) ([]UserSummary, error)
	ListRoles(ctx context.Context) ([]RoleSummary, error)
	ListPermissions(ctx context.Context) ([]PermissionSummary, error)
	ListAuditLogs(ctx context.Context, limit, offset int) ([]AuditLog, error)
	GetFsnReport(ctx context.Context) ([]FsnReportRow, error)
	GetValuationReport(ctx context.Context) ([]ValuationReportRow, error)
	GetSpaceUtilizationReport(ctx context.Context) ([]SpaceUtilizationRow, error)
	GetDashboardSummary(ctx context.Context) (*DashboardSummary, error)
}
