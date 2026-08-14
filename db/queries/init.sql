-- name: GetWarehouseByCode :one
SELECT id, code, name, address, is_active FROM master.warehouses
WHERE code = $1 LIMIT 1;

-- name: ListWarehouses :many
SELECT id, code, name, address, is_active FROM master.warehouses
ORDER BY code;

-- name: CreateWarehouse :one
INSERT INTO master.warehouses (code, name, address, is_active)
VALUES ($1, $2, $3, $4)
RETURNING id, code, name, address, is_active;

-- name: GetUserByUsername :one
SELECT id, username, email, full_name, password_hash, is_active, mfa_secret, last_login_at
FROM sec.users
WHERE username = $1 LIMIT 1;

-- name: CreateUser :one
INSERT INTO sec.users (username, email, full_name, password_hash, is_active)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, username, email, full_name, is_active;

-- name: GetUserByID :one
SELECT id, username, email, full_name, password_hash, is_active, mfa_secret, last_login_at
FROM sec.users
WHERE id = $1 LIMIT 1;

-- name: ListUserRoleCodes :many
SELECT DISTINCT COALESCE(r.code, '') AS code
FROM sec.roles r
JOIN sec.user_roles ur ON ur.role_id = r.id
WHERE ur.user_id = $1
ORDER BY code;

-- name: ListUserWarehouseCodes :many
SELECT DISTINCT w.code
FROM master.warehouses w
JOIN sec.user_roles ur ON ur.warehouse_id = w.id
WHERE ur.user_id = $1
ORDER BY w.code;

-- name: GetItemBySKU :one
SELECT id, public_id, sku, name, category_id, base_uom, is_batch, is_expiry, is_serial, min_qty, max_qty, safety_stock, lead_time_days, abc_class, is_active, created_at, created_by
FROM master.items
WHERE sku = $1 LIMIT 1;

-- ============ CATEGORIES ============

-- name: CreateCategory :one
INSERT INTO master.categories (code, name, is_active)
VALUES ($1, $2, $3)
RETURNING id, code, name, is_active;

-- ============ ITEMS & UOMS ============

-- name: CreateItem :one
INSERT INTO master.items (
    sku, name, category_id, base_uom, is_batch, is_expiry, is_serial,
    min_qty, max_qty, safety_stock, lead_time_days, abc_class, is_active, created_by
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING id, public_id, sku, name, category_id, base_uom, is_batch, is_expiry, is_serial, min_qty, max_qty, safety_stock, lead_time_days, abc_class, is_active, created_at, created_by;

-- name: UpdateItem :one
UPDATE master.items
SET name = $2, category_id = $3, base_uom = $4, is_batch = $5, is_expiry = $6, is_serial = $7,
    min_qty = $8, max_qty = $9, safety_stock = $10, lead_time_days = $11, abc_class = $12, is_active = $13,
    updated_at = NOW(), updated_by = $14
WHERE id = $1
RETURNING id, public_id, sku, name, category_id, base_uom, is_batch, is_expiry, is_serial, min_qty, max_qty, safety_stock, lead_time_days, abc_class, is_active, updated_at, updated_by;

-- name: GetItemByID :one
SELECT id, public_id, sku, name, category_id, base_uom, is_batch, is_expiry, is_serial, min_qty, max_qty, safety_stock, lead_time_days, abc_class, is_active, created_at, created_by, updated_at, updated_by
FROM master.items
WHERE id = $1 LIMIT 1;

-- name: ListItems :many
SELECT id, public_id, sku, name, category_id, base_uom, is_batch, is_expiry, is_serial, min_qty, max_qty, safety_stock, lead_time_days, abc_class, is_active
FROM master.items
ORDER BY sku;

-- name: SoftDeleteItem :one
UPDATE master.items
SET is_active = FALSE, updated_at = NOW(), updated_by = $2
WHERE id = $1
RETURNING id, is_active;

-- name: CreateItemUoM :one
INSERT INTO master.item_uoms (item_id, uom, conv_factor, barcode)
VALUES ($1, $2, $3, $4)
RETURNING id, item_id, uom, conv_factor, barcode;

-- name: ListItemUoMs :many
SELECT id, item_id, uom, conv_factor, barcode
FROM master.item_uoms
WHERE item_id = $1
ORDER BY conv_factor;

-- name: DeleteItemUoMs :exec
DELETE FROM master.item_uoms
WHERE item_id = $1;

-- ============ LOCATIONS ============

-- name: CreateLocation :one
INSERT INTO master.locations (warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active;

-- name: GetLocationByID :one
SELECT id, warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active
FROM master.locations
WHERE id = $1 LIMIT 1;

-- name: ListLocations :many
SELECT id, warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active
FROM master.locations
WHERE warehouse_id = $1
ORDER BY code;

-- name: UpdateLocation :one
UPDATE master.locations
SET code = $2, zone = $3, rack = $4, level = $5, loc_type = $6, pick_seq = $7, capacity = $8, is_active = $9
WHERE id = $1
RETURNING id, warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active;

-- name: DeleteLocation :exec
DELETE FROM master.locations
WHERE id = $1;

-- ============ PARTNERS ============

-- name: CreatePartner :one
INSERT INTO master.partners (code, partner_type, name, address, contact_name, contact_phone, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, code, partner_type, name, address, contact_name, contact_phone, is_active;

-- name: GetPartnerByID :one
SELECT id, code, partner_type, name, address, contact_name, contact_phone, is_active
FROM master.partners
WHERE id = $1 LIMIT 1;

-- name: ListPartners :many
SELECT id, code, partner_type, name, address, contact_name, contact_phone, is_active
FROM master.partners
ORDER BY code;

-- name: UpdatePartner :one
UPDATE master.partners
SET code = $2, partner_type = $3, name = $4, address = $5, contact_name = $6, contact_phone = $7, is_active = $8
WHERE id = $1
RETURNING id, code, partner_type, name, address, contact_name, contact_phone, is_active;

-- name: DeletePartner :exec
DELETE FROM master.partners
WHERE id = $1;

-- ============ STOCK BALANCES & MOVEMENTS ============

-- name: UpsertStockBalance :one
INSERT INTO inv.stock_balances (item_id, location_id, batch_id, status, qty_onhand, qty_reserved, updated_at)
VALUES ($1, $2, $3, $4, 0, 0, NOW())
ON CONFLICT (item_id, location_id, COALESCE(batch_id, 0), status) DO UPDATE SET updated_at = NOW()
RETURNING id, qty_onhand, qty_reserved;

-- name: GetStockBalanceByIDForUpdate :one
SELECT id, item_id, location_id, batch_id, status, qty_onhand, qty_reserved
FROM inv.stock_balances
WHERE id = $1
FOR UPDATE;

-- name: UpdateStockBalanceQty :one
UPDATE inv.stock_balances
SET qty_onhand = $2, qty_reserved = $3, updated_at = NOW()
WHERE id = $1
RETURNING id, qty_onhand, qty_reserved;

-- name: CreateStockMovement :one
INSERT INTO inv.stock_movements (item_id, location_id, batch_id, status, movement_type, qty, qty_after, doc_line_id, doc_no, created_by, moved_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
RETURNING id, moved_at, qty_after;

-- name: ListStockMovementsKeyset :many
SELECT id, moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after, doc_line_id, doc_no, created_by
FROM inv.stock_movements
WHERE moved_at >= $1 AND moved_at <= $2
  AND ($3::bigint = 0 OR item_id = $3)
  AND ($4::bigint = 0 OR location_id = $4)
  AND ($5::boolean = FALSE OR (moved_at < $6::timestamptz OR (moved_at = $6::timestamptz AND id < $7::bigint)))
ORDER BY moved_at DESC, id DESC
LIMIT $8;

-- name: GetStockBalanceForUpdate :one
SELECT id, item_id, location_id, batch_id, status, qty_onhand, qty_reserved, updated_at
FROM inv.stock_balances
WHERE item_id = $1 AND location_id = $2 AND COALESCE(batch_id, 0) = COALESCE($3, 0) AND status = $4
FOR UPDATE;

-- name: UpsertStockBalanceFull :exec
INSERT INTO inv.stock_balances (item_id, location_id, batch_id, status, qty_onhand, qty_reserved, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (item_id, location_id, COALESCE(batch_id, 0), status)
DO UPDATE SET qty_onhand = EXCLUDED.qty_onhand, qty_reserved = EXCLUDED.qty_reserved, updated_at = NOW();

-- name: InsertStockMovement :exec
INSERT INTO inv.stock_movements (item_id, location_id, batch_id, status, movement_type, qty, qty_after, doc_line_id, doc_no, created_by, moved_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW());

-- ============ RBAC (Fase 2.4) ============

-- name: ListRolePermissions :many
SELECT r.code AS role_code, p.code AS permission_code
FROM sec.roles r
JOIN sec.role_permissions rp ON rp.role_id = r.id
JOIN sec.permissions p ON p.id = rp.permission_id
ORDER BY r.code, p.code;

-- name: ListWarehouseCodes :many
SELECT code FROM master.warehouses WHERE is_active = TRUE ORDER BY code;
