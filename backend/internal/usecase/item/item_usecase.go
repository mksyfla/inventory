package item

import (
	"context"
	"fmt"

	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/crypto"
	"inventory/internal/repository/postgres"

	"github.com/jackc/pgx/v5/pgtype"
)

var (
	AESKey = []byte("this-is-a-very-secret-32byte-key") // 32 bytes AES-256 key
)

type Usecase struct {
	repo postgres.Querier
}

func NewUsecase(repo postgres.Querier) *Usecase {
	return &Usecase{repo: repo}
}

// ============ ITEM WORKFLOWS ============

type ItemUoMInput struct {
	Uom        string  `json:"uom"`
	ConvFactor float64 `json:"conv_factor"`
	Barcode    *string `json:"barcode"`
}

type CreateItemInput struct {
	Sku          string         `json:"sku"`
	Name         string         `json:"name"`
	CategoryID   *int64         `json:"category_id"`
	BaseUom      string         `json:"base_uom"`
	IsBatch      bool           `json:"is_batch"`
	IsExpiry     bool           `json:"is_expiry"`
	IsSerial     bool           `json:"is_serial"`
	MinQty       float64        `json:"min_qty"`
	MaxQty       *float64       `json:"max_qty"`
	SafetyStock  float64        `json:"safety_stock"`
	LeadTimeDays int16          `json:"lead_time_days"`
	AbcClass     *string        `json:"abc_class"`
	UoMs         []ItemUoMInput `json:"uoms"`
	CreatedBy    int64          `json:"created_by"`
}

func (u *Usecase) CreateItem(ctx context.Context, in CreateItemInput) (postgres.CreateItemRow, error) {
	// Rule: chk_expiry_needs_batch
	if in.IsExpiry && !in.IsBatch {
		return postgres.CreateItemRow{}, &apperr.AppError{
			Code:    "ERR_INVALID_INPUT",
			Message: "Item expiry tracking requires batch tracking to be enabled",
		}
	}

	var catID pgtype.Int8
	if in.CategoryID != nil {
		catID = pgtype.Int8{Int64: *in.CategoryID, Valid: true}
	}

	var maxQty pgtype.Numeric
	if in.MaxQty != nil {
		_ = maxQty.Scan(fmt.Sprintf("%f", *in.MaxQty))
	}

	var minQty pgtype.Numeric
	_ = minQty.Scan(fmt.Sprintf("%f", in.MinQty))

	var safetyStock pgtype.Numeric
	_ = safetyStock.Scan(fmt.Sprintf("%f", in.SafetyStock))

	var abc pgtype.Text
	if in.AbcClass != nil {
		abc = pgtype.Text{String: *in.AbcClass, Valid: true}
	}

	arg := postgres.CreateItemParams{
		Sku:          in.Sku,
		Name:         in.Name,
		CategoryID:   catID,
		BaseUom:      in.BaseUom,
		IsBatch:      in.IsBatch,
		IsExpiry:     in.IsExpiry,
		IsSerial:     in.IsSerial,
		MinQty:       minQty,
		MaxQty:       maxQty,
		SafetyStock:  safetyStock,
		LeadTimeDays: in.LeadTimeDays,
		AbcClass:     abc,
		IsActive:     true,
		CreatedBy:    in.CreatedBy,
	}

	row, err := u.repo.CreateItem(ctx, arg)
	if err != nil {
		return postgres.CreateItemRow{}, err
	}

	// Create UoMs
	for _, uom := range in.UoMs {
		var factor pgtype.Numeric
		_ = factor.Scan(fmt.Sprintf("%f", uom.ConvFactor))

		var barcode pgtype.Text
		if uom.Barcode != nil {
			barcode = pgtype.Text{String: *uom.Barcode, Valid: true}
		}

		_, err := u.repo.CreateItemUoM(ctx, postgres.CreateItemUoMParams{
			ItemID:     row.ID,
			Uom:        uom.Uom,
			ConvFactor: factor,
			Barcode:    barcode,
		})
		if err != nil {
			return postgres.CreateItemRow{}, fmt.Errorf("failed to create item uom: %w", err)
		}
	}

	return row, nil
}

type UpdateItemInput struct {
	ID           int64    `json:"id"`
	Name         string   `json:"name"`
	CategoryID   *int64   `json:"category_id"`
	BaseUom      string   `json:"base_uom"`
	IsBatch      bool     `json:"is_batch"`
	IsExpiry     bool     `json:"is_expiry"`
	IsSerial     bool     `json:"is_serial"`
	MinQty       float64  `json:"min_qty"`
	MaxQty       *float64 `json:"max_qty"`
	SafetyStock  float64  `json:"safety_stock"`
	LeadTimeDays int16    `json:"lead_time_days"`
	AbcClass     *string  `json:"abc_class"`
	IsActive     bool     `json:"is_active"`
	UpdatedBy    int64    `json:"updated_by"`
}

func (u *Usecase) UpdateItem(ctx context.Context, in UpdateItemInput) (postgres.UpdateItemRow, error) {
	// Rule: chk_expiry_needs_batch
	if in.IsExpiry && !in.IsBatch {
		return postgres.UpdateItemRow{}, &apperr.AppError{
			Code:    "ERR_INVALID_INPUT",
			Message: "Item expiry tracking requires batch tracking to be enabled",
		}
	}

	var catID pgtype.Int8
	if in.CategoryID != nil {
		catID = pgtype.Int8{Int64: *in.CategoryID, Valid: true}
	}

	var maxQty pgtype.Numeric
	if in.MaxQty != nil {
		_ = maxQty.Scan(fmt.Sprintf("%f", *in.MaxQty))
	}

	var minQty pgtype.Numeric
	_ = minQty.Scan(fmt.Sprintf("%f", in.MinQty))

	var safetyStock pgtype.Numeric
	_ = safetyStock.Scan(fmt.Sprintf("%f", in.SafetyStock))

	var abc pgtype.Text
	if in.AbcClass != nil {
		abc = pgtype.Text{String: *in.AbcClass, Valid: true}
	}

	arg := postgres.UpdateItemParams{
		ID:           in.ID,
		Name:         in.Name,
		CategoryID:   catID,
		BaseUom:      in.BaseUom,
		IsBatch:      in.IsBatch,
		IsExpiry:     in.IsExpiry,
		IsSerial:     in.IsSerial,
		MinQty:       minQty,
		MaxQty:       maxQty,
		SafetyStock:  safetyStock,
		LeadTimeDays: in.LeadTimeDays,
		AbcClass:     abc,
		IsActive:     in.IsActive,
		UpdatedBy:    pgtype.Int8{Int64: in.UpdatedBy, Valid: true},
	}

	return u.repo.UpdateItem(ctx, arg)
}

func (u *Usecase) SoftDeleteItem(ctx context.Context, id int64, updatedBy int64) error {
	_, err := u.repo.SoftDeleteItem(ctx, postgres.SoftDeleteItemParams{
		ID:        id,
		UpdatedBy: pgtype.Int8{Int64: updatedBy, Valid: true},
	})
	return err
}

// ============ LOCATION WORKFLOWS ============

type CreateLocationInput struct {
	WarehouseID int64    `json:"warehouse_id"`
	Code        string   `json:"code"`
	Zone        *string  `json:"zone"`
	Rack        *string  `json:"rack"`
	Level       *string  `json:"level"`
	LocType     string   `json:"loc_type"`
	PickSeq     *int32   `json:"pick_seq"`
	Capacity    *float64 `json:"capacity"`
}

func (u *Usecase) CreateLocation(ctx context.Context, in CreateLocationInput) (postgres.MasterLocations, error) {
	if in.Code == "" {
		return postgres.MasterLocations{}, &apperr.AppError{
			Code:    "ERR_INVALID_INPUT",
			Message: "Location code must not be empty",
		}
	}

	var zone, rack, level pgtype.Text
	if in.Zone != nil {
		zone = pgtype.Text{String: *in.Zone, Valid: true}
	}
	if in.Rack != nil {
		rack = pgtype.Text{String: *in.Rack, Valid: true}
	}
	if in.Level != nil {
		level = pgtype.Text{String: *in.Level, Valid: true}
	}

	var pickSeq pgtype.Int4
	if in.PickSeq != nil {
		pickSeq = pgtype.Int4{Int32: *in.PickSeq, Valid: true}
	}

	var capacity pgtype.Numeric
	if in.Capacity != nil {
		_ = capacity.Scan(fmt.Sprintf("%f", *in.Capacity))
	}

	arg := postgres.CreateLocationParams{
		WarehouseID: in.WarehouseID,
		Code:        in.Code,
		Zone:        zone,
		Rack:        rack,
		Level:       level,
		LocType:     in.LocType, // interface{} type
		PickSeq:     pickSeq,
		Capacity:    capacity,
		IsActive:    true,
	}

	return u.repo.CreateLocation(ctx, arg)
}

func (u *Usecase) ListLocations(ctx context.Context, warehouseID int64) ([]postgres.MasterLocations, error) {
	return u.repo.ListLocations(ctx, warehouseID)
}

// ============ PARTNER WORKFLOWS ============

type CreatePartnerInput struct {
	Code         string `json:"code"`
	PartnerType  string `json:"partner_type"`
	Name         string `json:"name"`
	Address      string `json:"address"`
	ContactName  string `json:"contact_name"`  // sensitive
	ContactPhone string `json:"contact_phone"` // sensitive
}

func (u *Usecase) CreatePartner(ctx context.Context, in CreatePartnerInput) (postgres.MasterPartners, error) {
	// Encrypt sensitive fields before database insertion (UU PDP standard)
	encName, err := crypto.Encrypt(in.ContactName, AESKey)
	if err != nil {
		return postgres.MasterPartners{}, fmt.Errorf("failed to encrypt contact name: %w", err)
	}

	encPhone, err := crypto.Encrypt(in.ContactPhone, AESKey)
	if err != nil {
		return postgres.MasterPartners{}, fmt.Errorf("failed to encrypt contact phone: %w", err)
	}

	arg := postgres.CreatePartnerParams{
		Code:         in.Code,
		PartnerType:  in.PartnerType,
		Name:         in.Name,
		Address:      pgtype.Text{String: in.Address, Valid: true},
		ContactName:  pgtype.Text{String: encName, Valid: true},
		ContactPhone: pgtype.Text{String: encPhone, Valid: true},
		IsActive:     true,
	}

	partner, err := u.repo.CreatePartner(ctx, arg)
	if err != nil {
		return postgres.MasterPartners{}, err
	}

	// Decrypt fields back for response payload
	partner.ContactName.String = in.ContactName
	partner.ContactPhone.String = in.ContactPhone

	return partner, nil
}

func (u *Usecase) GetPartner(ctx context.Context, id int64) (postgres.MasterPartners, error) {
	partner, err := u.repo.GetPartnerByID(ctx, id)
	if err != nil {
		return postgres.MasterPartners{}, err
	}

	// Decrypt sensitive contact fields
	if partner.ContactName.Valid && partner.ContactName.String != "" {
		decName, err := crypto.Decrypt(partner.ContactName.String, AESKey)
		if err == nil {
			partner.ContactName.String = decName
		}
	}

	if partner.ContactPhone.Valid && partner.ContactPhone.String != "" {
		decPhone, err := crypto.Decrypt(partner.ContactPhone.String, AESKey)
		if err == nil {
			partner.ContactPhone.String = decPhone
		}
	}

	return partner, nil
}

func (u *Usecase) ListPartners(ctx context.Context) ([]postgres.MasterPartners, error) {
	partners, err := u.repo.ListPartners(ctx)
	if err != nil {
		return nil, err
	}

	for i := range partners {
		if partners[i].ContactName.Valid && partners[i].ContactName.String != "" {
			if decName, err := crypto.Decrypt(partners[i].ContactName.String, AESKey); err == nil {
				partners[i].ContactName.String = decName
			}
		}
		if partners[i].ContactPhone.Valid && partners[i].ContactPhone.String != "" {
			if decPhone, err := crypto.Decrypt(partners[i].ContactPhone.String, AESKey); err == nil {
				partners[i].ContactPhone.String = decPhone
			}
		}
	}

	return partners, nil
}

// ============ CATEGORIES ============
func (u *Usecase) CreateCategory(ctx context.Context, code, name string) (postgres.MasterCategories, error) {
	return u.repo.CreateCategory(ctx, postgres.CreateCategoryParams{
		Code:     code,
		Name:     name,
		IsActive: true,
	})
}

func (u *Usecase) ListCategories(ctx context.Context) ([]postgres.MasterCategories, error) {
	return u.repo.ListCategories(ctx)
}

// ============ GET ITEM / LIST ITEMS ============
func (u *Usecase) GetItem(ctx context.Context, id int64) (postgres.MasterItems, []postgres.MasterItemUoms, error) {
	item, err := u.repo.GetItemByID(ctx, id)
	if err != nil {
		return postgres.MasterItems{}, nil, err
	}
	uoms, err := u.repo.ListItemUoMs(ctx, id)
	if err != nil {
		return postgres.MasterItems{}, nil, err
	}
	return item, uoms, nil
}

func (u *Usecase) ListItems(ctx context.Context) ([]postgres.ListItemsRow, error) {
	return u.repo.ListItems(ctx)
}

// Verify category or warehouse existence helper
func (u *Usecase) GetWarehouse(ctx context.Context, code string) (postgres.MasterWarehouses, error) {
	return u.repo.GetWarehouseByCode(ctx, code)
}

func (u *Usecase) CreateWarehouse(ctx context.Context, code, name, address string) (postgres.MasterWarehouses, error) {
	return u.repo.CreateWarehouse(ctx, postgres.CreateWarehouseParams{
		Code:     code,
		Name:     name,
		Address:  pgtype.Text{String: address, Valid: true},
		IsActive: true,
	})
}
