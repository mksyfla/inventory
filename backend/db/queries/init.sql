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

-- name: EnsureBalanceExists :exec
-- Creates a zeroed balance row if absent so the subsequent SELECT ... FOR
-- UPDATE actually locks it. Without this, two concurrent transactions that
-- both see "no row" would later race on the upsert and overwrite each
-- other's snapshot (lost update — caught by the Fase 10.3 concurrency test).
INSERT INTO inv.stock_balances (item_id, location_id, batch_id, status, qty_onhand, qty_reserved, updated_at)
VALUES ($1, $2, $3, $4, 0, 0, NOW())
ON CONFLICT (item_id, location_id, COALESCE(batch_id, 0), status) DO NOTHING;

-- name: UpsertStockBalanceFull :exec
INSERT INTO inv.stock_balances (item_id, location_id, batch_id, status, qty_onhand, qty_reserved, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (item_id, location_id, COALESCE(batch_id, 0), status)
DO UPDATE SET qty_onhand = EXCLUDED.qty_onhand, qty_reserved = EXCLUDED.qty_reserved, updated_at = NOW();

-- name: InsertStockMovement :exec
INSERT INTO inv.stock_movements (item_id, location_id, batch_id, status, movement_type, qty, qty_after, doc_line_id, doc_no, created_by, moved_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW());

-- ============ INBOUND (Fase 6 - GRN) ============

-- name: GetWarehouseByID :one
SELECT id, code, name, is_active
FROM master.warehouses
WHERE id = $1;

-- name: GetBatchByItemAndNo :one
SELECT id, item_id, batch_no, mfg_date, expiry_date
FROM master.batches
WHERE item_id = $1 AND batch_no = $2
LIMIT 1;

-- name: CreateBatch :one
INSERT INTO master.batches (item_id, batch_no, mfg_date, expiry_date)
VALUES ($1, $2, $3, $4)
RETURNING id, item_id, batch_no, mfg_date, expiry_date;

-- name: GetStagingLocation :one
SELECT id, warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active
FROM master.locations
WHERE warehouse_id = $1 AND loc_type = 'staging' AND is_active = TRUE
ORDER BY code
LIMIT 1;

-- name: GetLocationByWarehouseCode :one
SELECT id, warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active
FROM master.locations
WHERE warehouse_id = $1 AND code = $2 AND is_active = TRUE
LIMIT 1;

-- name: ListPutawayCandidates :many
SELECT l.id, l.warehouse_id, l.code, l.zone, l.rack, l.level, l.loc_type, l.pick_seq, l.capacity,
       COALESCE(SUM(b.qty_onhand), 0)::numeric(18,4) AS used_qty
FROM master.locations l
LEFT JOIN inv.stock_balances b ON b.location_id = l.id AND b.status = 'available'
WHERE l.warehouse_id = $1 AND l.is_active = TRUE AND l.loc_type IN ('pick','bulk')
GROUP BY l.id
ORDER BY l.pick_seq NULLS LAST, l.code;

-- name: CreateDocument :one
INSERT INTO doc.documents (doc_no, doc_type, doc_date, status, warehouse_id, dest_warehouse_id, ref_doc_id, partner_id, reason_code, idempotency_key, notes, created_by)
VALUES ($1, $2::doc.doc_type, $3, $4::doc.doc_status, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING id, public_id, doc_no, doc_type, doc_date, status, warehouse_id, dest_warehouse_id, ref_doc_id, partner_id, reason_code, idempotency_key, notes, created_by, created_at;

-- name: CreateDocumentLine :one
INSERT INTO doc.document_lines (document_id, line_no, item_id, uom, conv_factor, qty_request, qty_processed, batch_id, location_id, status, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::inv.stock_status, $11)
RETURNING id, document_id, line_no, item_id, uom, conv_factor, qty_request, qty_processed, batch_id, location_id, status, notes;

-- name: GetDocumentByID :one
SELECT id, public_id, doc_no, doc_type, doc_date, status, warehouse_id, dest_warehouse_id, partner_id, ref_doc_id, reason_code, notes, idempotency_key, created_at, created_by, submitted_at, approved_at, approved_by, completed_at, manager_approved_by, manager_approved_at
FROM doc.documents
WHERE id = $1;

-- name: GetDocumentByIDempotencyKey :one
SELECT id, public_id, doc_no, doc_type, doc_date, status, warehouse_id, dest_warehouse_id, partner_id, ref_doc_id, reason_code, notes, idempotency_key, created_at, created_by, submitted_at, approved_at, approved_by, completed_at, manager_approved_by, manager_approved_at
FROM doc.documents
WHERE idempotency_key = $1;

-- name: ListDocumentLines :many
SELECT id, document_id, line_no, item_id, uom, conv_factor, qty_request, qty_processed, batch_id, location_id, status, notes
FROM doc.document_lines
WHERE document_id = $1
ORDER BY line_no;

-- name: UpdateDocumentStatus :exec
UPDATE doc.documents
SET status = $2::doc.doc_status,
    submitted_at = CASE WHEN $2::doc.doc_status = 'submitted' THEN NOW() ELSE submitted_at END,
    approved_at  = CASE WHEN $2::doc.doc_status = 'approved' THEN NOW() ELSE approved_at END,
    approved_by  = CASE WHEN $2::doc.doc_status = 'approved' THEN $3 ELSE approved_by END,
    completed_at = CASE WHEN $2::doc.doc_status = 'completed' THEN NOW() ELSE completed_at END
WHERE id = $1;

-- name: UpdateDocumentLinePutaway :exec
UPDATE doc.document_lines
SET qty_processed = $2, location_id = $3
WHERE id = $1;

-- name: UpdateDocumentLineProcessed :exec
UPDATE doc.document_lines
SET qty_processed = $2
WHERE id = $1;

-- ============ OUTBOUND (Fase 7 - DO / REQ / FEFO-FIFO) ============

-- name: ListAllocationCandidates :many
-- FEFO/FIFO candidate balances for one item in a warehouse (FSD §4.2).
-- Rows are locked (FOR UPDATE OF b — only the balances table, since
-- PostgreSQL forbids locking the nullable side of an outer join) so allocation
-- is race-safe against concurrent allocators/posters.
SELECT b.id AS balance_id, b.item_id, b.location_id, b.batch_id,
       b.qty_onhand, b.qty_reserved,
       l.code AS location_code, l.pick_seq, bt.expiry_date
FROM inv.stock_balances b
JOIN master.locations l ON l.id = b.location_id
LEFT JOIN master.batches bt ON bt.id = b.batch_id
WHERE b.item_id = $1
  AND l.warehouse_id = $2
  AND b.status = 'available'
  AND l.loc_type IN ('pick','bulk')
  AND b.qty_onhand > b.qty_reserved
  AND (bt.expiry_date IS NULL OR bt.expiry_date > CURRENT_DATE)
ORDER BY bt.expiry_date NULLS LAST, b.id, l.pick_seq
FOR UPDATE OF b;

-- name: UpdateBalanceReserved :exec
UPDATE inv.stock_balances
SET qty_reserved = qty_reserved + $2, updated_at = NOW()
WHERE id = $1;

-- name: GetAllocationCandidateByBalanceID :one
-- Manual override target: locks one specific balance (Fase 7.3). Must belong
-- to the warehouse, be available, and not be expired.
SELECT b.id AS balance_id, b.item_id, b.location_id, b.batch_id,
       b.qty_onhand, b.qty_reserved,
       l.warehouse_id, l.code AS location_code, l.pick_seq, bt.expiry_date
FROM inv.stock_balances b
JOIN master.locations l ON l.id = b.location_id
LEFT JOIN master.batches bt ON bt.id = b.batch_id
WHERE b.id = $1
  AND l.warehouse_id = $2
  AND b.status = 'available'
  AND (bt.expiry_date IS NULL OR bt.expiry_date > CURRENT_DATE)
FOR UPDATE OF b;

-- name: UpdateDocumentReasonCode :exec
UPDATE doc.documents
SET reason_code = $2
WHERE id = $1;

-- name: GetItemByBarcode :one
SELECT i.id AS item_id, i.sku, i.base_uom, u.uom, u.conv_factor
FROM master.item_uoms u
JOIN master.items i ON i.id = u.item_id
WHERE u.barcode = $1
LIMIT 1;

-- name: CreateAllocation :one
INSERT INTO doc.allocations (doc_line_id, balance_id, qty_allocated, qty_picked, created_at)
VALUES ($1, $2, $3, 0, NOW())
RETURNING id, doc_line_id, balance_id, qty_allocated, qty_picked, created_at;

-- name: ListAllocationsByDocument :many
SELECT a.id, a.doc_line_id, a.balance_id, a.qty_allocated, a.qty_picked,
       b.item_id, b.location_id, b.batch_id,
       l.code AS location_code, l.pick_seq,
       bt.batch_no, bt.expiry_date,
       i.sku, i.base_uom
FROM doc.allocations a
JOIN inv.stock_balances b ON b.id = a.balance_id
JOIN master.locations l ON l.id = b.location_id
JOIN master.items i ON i.id = b.item_id
LEFT JOIN master.batches bt ON bt.id = b.batch_id
JOIN doc.document_lines dl ON dl.id = a.doc_line_id
WHERE dl.document_id = $1
ORDER BY l.pick_seq NULLS LAST, l.code, a.id;

-- name: UpdateAllocationPicked :exec
UPDATE doc.allocations
SET qty_picked = qty_picked + $2
WHERE id = $1;

-- name: GetDeliveryByDocument :one
SELECT document_id, vehicle_no, driver_name, shipped_at, received_by, received_at, pod_file_url, signature_url
FROM doc.deliveries
WHERE document_id = $1;

-- name: UpsertDelivery :exec
INSERT INTO doc.deliveries (document_id, vehicle_no, driver_name, shipped_at, received_by, received_at, pod_file_url, signature_url)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (document_id) DO UPDATE SET
    vehicle_no    = COALESCE(EXCLUDED.vehicle_no,    doc.deliveries.vehicle_no),
    driver_name   = COALESCE(EXCLUDED.driver_name,   doc.deliveries.driver_name),
    shipped_at    = COALESCE(EXCLUDED.shipped_at,    doc.deliveries.shipped_at),
    received_by   = COALESCE(EXCLUDED.received_by,   doc.deliveries.received_by),
    received_at   = COALESCE(EXCLUDED.received_at,   doc.deliveries.received_at),
    pod_file_url  = COALESCE(EXCLUDED.pod_file_url,  doc.deliveries.pod_file_url),
    signature_url = COALESCE(EXCLUDED.signature_url, doc.deliveries.signature_url);

-- ============ Dokumen (Fase 5.1 - BR-04) ============

-- name: UpsertDocumentNumber :one
-- Atomic sequence bump: returns the next sequence for (doc_type, period).
-- Must run inside the same transaction that creates the document (FSD 4.3).
-- Period is computed by the application from the same clock as the document
-- number so the sequence and the formatted number can never diverge.
INSERT INTO doc.document_numbers (doc_type, period, last_seq)
VALUES ($1, $2, 1)
ON CONFLICT (doc_type, period)
DO UPDATE SET last_seq = doc.document_numbers.last_seq + 1
RETURNING last_seq;

-- ============ RBAC (Fase 2.4) ============

-- name: ListRolePermissions :many
SELECT r.code AS role_code, p.code AS permission_code
FROM sec.roles r
JOIN sec.role_permissions rp ON rp.role_id = r.id
JOIN sec.permissions p ON p.id = rp.permission_id
ORDER BY r.code, p.code;

-- name: ListWarehouseCodes :many
SELECT code FROM master.warehouses WHERE is_active = TRUE ORDER BY code;

-- ============ FASE 8 (M5 Transfer & M6 Stock Opname) ============

-- name: GetTransitLocation :one
-- Lokasi transit gudang tujuan (tempat saldo in_transit dicatat saat /send).
SELECT id, warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active
FROM master.locations
WHERE warehouse_id = $1 AND loc_type = 'transit' AND is_active = TRUE
ORDER BY code
LIMIT 1;

-- name: CreateTransferReceipt :one
INSERT INTO doc.transfer_receipts (document_id, line_id, qty_sent, qty_received, received_by, notes)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, document_id, line_id, qty_sent, qty_received, variance, received_by, received_at, notes;

-- name: ListTransferReceipts :many
SELECT id, document_id, line_id, qty_sent, qty_received, variance, received_by, received_at, notes
FROM doc.transfer_receipts
WHERE document_id = $1
ORDER BY line_id;

-- name: ListCountSnapshotBalances :many
-- Sumber snapshot qty_system saat sesi opname dibuka (FR-6.1). Scope dapat
-- dipersempit per zona ('' = semua) dan/atau per item (0 = semua).
SELECT b.item_id, b.location_id, b.batch_id, b.status, b.qty_onhand
FROM inv.stock_balances b
JOIN master.locations l ON l.id = b.location_id
WHERE l.warehouse_id = $1
  AND ($2::varchar = '' OR l.zone = $2)
  AND ($3::bigint = 0 OR b.item_id = $3)
  AND b.qty_onhand > 0
ORDER BY b.item_id, b.location_id, COALESCE(b.batch_id, 0);

-- name: CreateCountLine :one
INSERT INTO doc.count_lines (document_id, item_id, location_id, batch_id, qty_system)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, document_id, item_id, location_id, batch_id, qty_system, qty_counted, variance, reason_code, counted_by, counted_at;

-- name: ListCountLines :many
SELECT id, document_id, item_id, location_id, batch_id, qty_system, qty_counted, variance, reason_code, counted_by, counted_at
FROM doc.count_lines
WHERE document_id = $1
ORDER BY id;

-- name: UpdateCountLineCounted :exec
UPDATE doc.count_lines
SET qty_counted = $2, reason_code = $3, counted_by = $4, counted_at = NOW()
WHERE id = $1;

-- name: UpdateDocumentManagerApproval :exec
UPDATE doc.documents
SET manager_approved_by = $2, manager_approved_at = NOW()
WHERE id = $1;

-- name: GetLastUnitCostByItem :one
-- Harga pokok terakhir item untuk menilai selisih opname (M6.4 threshold).
SELECT unit_cost
FROM inv.stock_movements
WHERE item_id = $1 AND unit_cost IS NOT NULL
ORDER BY moved_at DESC, id DESC
LIMIT 1;

-- name: InsertAuditLog :exec
INSERT INTO aud.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
VALUES ($1, $2, $3, $4, $5, $6);
