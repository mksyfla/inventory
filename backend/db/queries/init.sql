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

-- name: ListCategories :many
SELECT id, code, name, is_active
FROM master.categories
WHERE is_active = TRUE
ORDER BY name;

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

-- name: GetRoleByCode :one
SELECT id, code, name FROM sec.roles WHERE code = $1 LIMIT 1;

-- name: AssignUserRole :one
INSERT INTO sec.user_roles (user_id, role_id, warehouse_id)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, role_id, warehouse_id) DO NOTHING
RETURNING user_id, role_id, warehouse_id;

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

-- name: GetCountLinesWithItem :many
-- Snapshot/result lines of a count session joined with item/location/batch so
-- the supervisor reconciliation screen (GET /counts/{id}) renders without N+1.
-- qty_system is intentionally included here: this view is for the supervisor,
-- not the blind-count field screen.
SELECT cl.id, cl.item_id, i.sku, i.name::text AS item_name,
       i.base_uom, cl.location_id, l.code AS location_code,
       cl.batch_id, bt.batch_no, bt.expiry_date,
       cl.qty_system, cl.qty_counted, cl.variance, cl.reason_code,
       cl.counted_by, cl.counted_at
FROM doc.count_lines cl
JOIN master.items i ON i.id = cl.item_id
LEFT JOIN master.locations l ON l.id = cl.location_id
LEFT JOIN master.batches bt ON bt.id = cl.batch_id
WHERE cl.document_id = $1
ORDER BY cl.id;

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
INSERT INTO aud.audit_logs (user_id, action, entity, entity_id, old_value, new_value, ip_address)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- ============ READ / QUERY ENDPOINTS (Fase 10.4 GETs) ============
-- List/detail GETs shared across document types (GRN/REQ/DO/TRF/CNT/ADJ).
-- Filter params use the '' = no-filter convention to keep sqlc params as
-- plain text; warehouse_id uses 0 = no filter.

-- name: ListDocuments :many
SELECT d.id, d.public_id, d.doc_no, d.doc_type::text, d.doc_date, d.status::text,
       d.warehouse_id, d.dest_warehouse_id, d.partner_id, d.ref_doc_id,
       d.reason_code, d.notes, d.created_at, d.created_by,
       d.submitted_at, d.approved_at, d.approved_by, d.completed_at,
       d.manager_approved_by, d.manager_approved_at,
       w.code AS warehouse_code, w.name AS warehouse_name,
       dw.code AS dest_warehouse_code, dw.name AS dest_warehouse_name,
       p.code AS partner_code, p.name AS partner_name,
       rd.doc_no AS ref_doc_no,
       (SELECT COUNT(*)::bigint FROM doc.document_lines dl WHERE dl.document_id = d.id) AS line_count
FROM doc.documents d
LEFT JOIN master.warehouses w ON w.id = d.warehouse_id
LEFT JOIN master.warehouses dw ON dw.id = d.dest_warehouse_id
LEFT JOIN master.partners p ON p.id = d.partner_id
LEFT JOIN doc.documents rd ON rd.id = d.ref_doc_id
WHERE ($1 = '' OR d.doc_type::text = $1)
  AND ($2 = '' OR d.status::text = $2)
  AND ($3 = 0 OR d.warehouse_id = $3)
ORDER BY d.doc_date DESC, d.id DESC
LIMIT $4 OFFSET $5;

-- name: GetDocumentLinesWithItem :many
SELECT dl.id, dl.document_id, dl.line_no, dl.item_id, i.sku, i.name::text AS item_name,
       dl.uom, dl.conv_factor, dl.qty_request, dl.qty_processed,
       dl.batch_id, dl.location_id, dl.status::text, dl.notes
FROM doc.document_lines dl
JOIN master.items i ON i.id = dl.item_id
WHERE dl.document_id = $1
ORDER BY dl.line_no;

-- name: GetDocumentPartner :one
SELECT p.id, p.code, p.partner_type::text, p.name, p.is_active
FROM master.partners p
WHERE p.id = $1;

-- name: GetDocumentWarehouse :one
SELECT w.id, w.code, w.name, w.is_active
FROM master.warehouses w
WHERE w.id = $1;

-- ============ STOCK (balances / batch trace) ============

-- name: ListStockBalances :many
SELECT b.id AS balance_id, b.item_id, i.sku, i.name::text AS item_name,
       i.base_uom, c.name::text AS category_name,
       w.id AS warehouse_id, w.name::text AS warehouse_name,
       b.location_id, l.code AS location_code, l.zone, l.rack, l.level,
       b.batch_id, bt.batch_no, bt.expiry_date,
       b.status::text, b.qty_onhand, b.qty_reserved, b.updated_at
FROM inv.stock_balances b
JOIN master.items i ON i.id = b.item_id
JOIN master.locations l ON l.id = b.location_id
JOIN master.warehouses w ON w.id = l.warehouse_id
LEFT JOIN master.categories c ON c.id = i.category_id
LEFT JOIN master.batches bt ON bt.id = b.batch_id
WHERE ($1 = '' OR w.code = $1)
  AND ($2 = '' OR b.status::text = $2)
  AND ($3 = '' OR i.sku ILIKE '%' || $3 || '%' OR i.name ILIKE '%' || $3 || '%')
  AND ($4 = 0 OR i.category_id = $4)
ORDER BY i.sku, b.id;

-- name: ListBatchTrace :many
SELECT b.id AS batch_id, b.batch_no, b.item_id, i.sku, i.name::text AS item_name,
       i.base_uom, b.mfg_date, b.expiry_date,
       sb.id AS balance_id, sb.location_id, l.code AS location_code,
       COALESCE(sb.status::text, '')::text AS sb_status, sb.qty_onhand, sb.qty_reserved,
       COALESCE(grn.grn_no, '') AS grn_no, grn.grn_date, grn.supplier_name
FROM master.batches b
JOIN master.items i ON i.id = b.item_id
LEFT JOIN inv.stock_balances sb ON sb.batch_id = b.id
LEFT JOIN master.locations l ON l.id = sb.location_id
LEFT JOIN LATERAL (
    SELECT g.doc_no AS grn_no, g.doc_date::date AS grn_date, p.name AS supplier_name
    FROM doc.documents g
    JOIN doc.document_lines gl ON gl.document_id = g.id AND gl.batch_id = b.id
    LEFT JOIN master.partners p ON p.id = g.partner_id
    WHERE g.doc_type = 'GRN'
    ORDER BY g.created_at
    LIMIT 1
) grn ON TRUE
WHERE ($1 = '' OR b.batch_no ILIKE '%' || $1 || '%' OR i.sku ILIKE '%' || $1 || '%' OR i.name ILIKE '%' || $1 || '%')
ORDER BY b.expiry_date NULLS LAST, b.id;

-- name: ListStockLedger :many
-- Immutable movement ledger rows joined with item/location/batch/user so the
-- stock card page can render without extra lookups. item_id uses 0 = no filter;
-- moved_at is constrained to [from, to].
SELECT m.id, m.moved_at, m.item_id, i.sku, i.name::text AS item_name, i.base_uom,
       m.location_id, l.code AS location_code,
       m.batch_id, bt.batch_no,
       m.status::text, m.movement_type::text, m.qty, m.qty_after, m.doc_no,
       m.created_by, COALESCE(u.username, '')::text AS operator_name
FROM inv.stock_movements m
JOIN master.items i ON i.id = m.item_id
LEFT JOIN master.locations l ON l.id = m.location_id
LEFT JOIN master.batches bt ON bt.id = m.batch_id
LEFT JOIN sec.users u ON u.id = m.created_by
WHERE ($1::bigint = 0 OR m.item_id = $1)
  AND m.moved_at >= $2::timestamptz AND m.moved_at <= $3::timestamptz
ORDER BY m.moved_at DESC, m.id DESC
LIMIT $4 OFFSET $5;

-- ============ ADMIN (users / roles / audit logs) ============

-- name: ListUsers :many
SELECT u.id, u.username, u.email, u.full_name, u.phone, u.is_active, u.last_login_at,
       COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}')::text[] AS roles,
       COALESCE(array_agg(DISTINCT w.code) FILTER (WHERE w.code IS NOT NULL), '{}')::text[] AS warehouses,
       COALESCE(array_agg(DISTINCT ur.warehouse_id) FILTER (WHERE ur.warehouse_id IS NOT NULL), '{}')::bigint[] AS warehouse_ids
FROM sec.users u
LEFT JOIN sec.user_roles ur ON ur.user_id = u.id
LEFT JOIN sec.roles r ON r.id = ur.role_id
LEFT JOIN master.warehouses w ON w.id = ur.warehouse_id
GROUP BY u.id
ORDER BY u.id;

-- name: ListRoles :many
SELECT r.id, r.code, r.name, r.description,
       COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}')::text[] AS permissions
FROM sec.roles r
LEFT JOIN sec.role_permissions rp ON rp.role_id = r.id
LEFT JOIN sec.permissions p ON p.id = rp.permission_id
GROUP BY r.id
ORDER BY r.code;

-- name: ListAuditLogs :many
SELECT al.id, al.occurred_at, al.user_id, u.username AS actor_username,
       al.action, al.entity, al.entity_id, al.old_value, al.new_value,
       al.ip_address::text, al.request_id
FROM aud.audit_logs al
LEFT JOIN sec.users u ON u.id = al.user_id
ORDER BY al.occurred_at DESC
LIMIT $1 OFFSET $2;

-- ============ ADMIN WRITE (users / roles / settings) ============

-- name: CreateUserFull :one
INSERT INTO sec.users (username, email, full_name, password_hash, phone, is_active)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, username, email, full_name, phone, is_active;

-- name: UpdateUser :one
UPDATE sec.users
SET full_name = $2, email = $3, phone = $4, is_active = $5
WHERE id = $1
RETURNING id, username, email, full_name, phone, is_active;

-- name: UpdateUserPassword :one
UPDATE sec.users SET password_hash = $2 WHERE id = $1 RETURNING id;

-- name: DeleteUserRoles :exec
DELETE FROM sec.user_roles WHERE user_id = $1;

-- name: ListUserRoleIDs :many
SELECT DISTINCT ur.role_id FROM sec.user_roles ur WHERE ur.user_id = $1 AND ur.role_id IS NOT NULL;

-- name: ListUserWarehouseIDs :many
SELECT DISTINCT ur.warehouse_id FROM sec.user_roles ur WHERE ur.user_id = $1 AND ur.warehouse_id IS NOT NULL;

-- name: CreateRole :one
INSERT INTO sec.roles (code, name, description)
VALUES ($1, $2, $3)
RETURNING id, code, name, description;

-- name: UpdateRole :one
UPDATE sec.roles SET code = $2, name = $3, description = $4 WHERE id = $1
RETURNING id, code, name, description;

-- name: DeleteRolePermissions :exec
DELETE FROM sec.role_permissions WHERE role_id = $1;

-- name: AssignRolePermission :one
INSERT INTO sec.role_permissions (role_id, permission_id)
VALUES ($1, $2)
ON CONFLICT (role_id, permission_id) DO NOTHING
RETURNING role_id, permission_id;

-- name: GetPermissionByCode :one
SELECT id, code FROM sec.permissions WHERE code = $1 LIMIT 1;

-- name: ListPermissions :many
SELECT id, code FROM sec.permissions ORDER BY code;

-- name: UpsertSetting :one
INSERT INTO sec.settings (key, value, updated_by, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
RETURNING key, value, updated_by, updated_at;

-- name: ListSettings :many
SELECT key, value, updated_by, updated_at FROM sec.settings ORDER BY key;

-- ============ REPORTS ============

-- name: GetFsnReport :many
-- Classifies items by velocity from the movement ledger (Fase 10.x):
--   fast_moving  : last movement within the last 30 days
--   slow_moving  : last movement 30-180 days ago
--   dead_stock   : no movement in the last 180 days (or never)
WITH item_mov AS (
    SELECT m.item_id,
           MAX(m.moved_at) AS last_moved,
           COUNT(*) FILTER (WHERE m.moved_at >= CURRENT_DATE - INTERVAL '180 days') AS mov_180d
    FROM inv.stock_movements m
    GROUP BY m.item_id
),
item_qty AS (
    SELECT b.item_id, SUM(b.qty_onhand) AS qty_onhand
    FROM inv.stock_balances b
    WHERE b.status = 'available'
    GROUP BY b.item_id
),
item_cost AS (
    SELECT DISTINCT ON (m.item_id) m.item_id, m.unit_cost
    FROM inv.stock_movements m
    WHERE m.unit_cost IS NOT NULL
    ORDER BY m.item_id, m.moved_at DESC, m.id DESC
)
SELECT i.id, i.sku, i.name::text AS item_name, c.name::text AS category_name,
       i.base_uom,
       COALESCE(im.last_moved, TIMESTAMPTZ 'epoch')::timestamptz AS last_movement_date,
       CASE
           WHEN im.last_moved IS NULL THEN 'dead_stock'
           WHEN im.last_moved >= CURRENT_DATE - INTERVAL '30 days' THEN 'fast_moving'
           WHEN im.last_moved >= CURRENT_DATE - INTERVAL '180 days' THEN 'slow_moving'
           ELSE 'dead_stock'
       END AS fsn_category,
       COALESCE(im.mov_180d, 0)::int AS turnover_ratio,
       COALESCE(iq.qty_onhand, 0)::float8 AS current_qty,
       COALESCE(ROUND(COALESCE(iq.qty_onhand, 0) * COALESCE(ic.unit_cost, 0), 2), 0)::float8 AS total_valuation
FROM master.items i
LEFT JOIN master.categories c ON c.id = i.category_id
LEFT JOIN item_mov im ON im.item_id = i.id
LEFT JOIN item_qty iq ON iq.item_id = i.id
LEFT JOIN item_cost ic ON ic.item_id = i.id
WHERE i.is_active = TRUE
ORDER BY i.sku;

-- name: GetValuationReport :many
-- Periode valuasi: saldo akhir x harga pokok terakhir, plus total pergerakan
-- masuk/keluar (fallback ke seluruh riwayat bila tanpa filter periode).
WITH item_qty AS (
    SELECT b.item_id,
           SUM(b.qty_onhand) FILTER (WHERE b.status = 'available') AS qty_onhand
    FROM inv.stock_balances b
    GROUP BY b.item_id
),
item_cost AS (
    SELECT DISTINCT ON (m.item_id) m.item_id, m.unit_cost
    FROM inv.stock_movements m
    WHERE m.unit_cost IS NOT NULL
    ORDER BY m.item_id, m.moved_at DESC, m.id DESC
),
mov_in AS (
    SELECT m.item_id, SUM(m.qty) AS qty, SUM(m.qty * COALESCE(m.unit_cost, 0)) AS value
    FROM inv.stock_movements m
    WHERE m.qty > 0
    GROUP BY m.item_id
),
mov_out AS (
    SELECT m.item_id, SUM(-m.qty) AS qty, SUM(-m.qty * COALESCE(m.unit_cost, 0)) AS value
    FROM inv.stock_movements m
    WHERE m.qty < 0
    GROUP BY m.item_id
)
SELECT i.id, i.sku, i.name::text AS item_name, c.name::text AS category_name,
       i.base_uom AS uom,
       COALESCE(ic.unit_cost, 0)::float8 AS unit_price,
       COALESCE(iq.qty_onhand, 0)::float8 AS ending_qty,
       COALESCE(ROUND(COALESCE(iq.qty_onhand, 0) * COALESCE(ic.unit_cost, 0), 2), 0)::float8 AS ending_value,
       COALESCE(mi.qty, 0)::float8 AS inbound_qty,
       COALESCE(ROUND(mi.value, 2), 0)::float8 AS inbound_value,
       COALESCE(mo.qty, 0)::float8 AS outbound_qty,
       COALESCE(ROUND(mo.value, 2), 0)::float8 AS outbound_value
FROM master.items i
LEFT JOIN master.categories c ON c.id = i.category_id
LEFT JOIN item_qty iq ON iq.item_id = i.id
LEFT JOIN item_cost ic ON ic.item_id = i.id
LEFT JOIN mov_in mi ON mi.item_id = i.id
LEFT JOIN mov_out mo ON mo.item_id = i.id
WHERE i.is_active = TRUE
ORDER BY i.sku;

-- name: GetSpaceUtilizationReport :many
-- Memakai kapasitas volume (capacity) per lokasi sebagai pembilang dan
-- memperkirakan pemakaian dari keberadaan saldo stok aktif di lokasi tsb.
SELECT w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
       l.id AS location_id, l.code AS location_code,
       COALESCE(l.zone, '-') AS zone_name, l.loc_type::text AS loc_type,
       COALESCE(l.capacity, 0)::float8 AS capacity_volume_m3,
       (CASE WHEN COALESCE(sb.qty_onhand, 0) > 0 THEN COALESCE(l.capacity, 0) ELSE 0 END)::float8 AS used_volume_m3
FROM master.warehouses w
JOIN master.locations l ON l.warehouse_id = w.id
LEFT JOIN LATERAL (
    SELECT SUM(b.qty_onhand) AS qty_onhand
    FROM inv.stock_balances b
    WHERE b.location_id = l.id
) sb ON TRUE
WHERE w.is_active = TRUE
ORDER BY w.code, l.zone NULLS FIRST, l.code;

-- name: GetDashboardSummary :one
-- Ringkasan KPI dashboard operasional (Fase 10.x).
WITH doc_counts AS (
    SELECT
        COUNT(*) FILTER (WHERE doc_type = 'GRN' AND doc_date = CURRENT_DATE) AS grn_today,
        COUNT(*) FILTER (WHERE doc_type = 'DO' AND doc_date = CURRENT_DATE) AS do_today,
        COUNT(*) FILTER (WHERE doc_type = 'REQ' AND status IN ('draft','submitted')) AS req_open,
        COUNT(*) FILTER (WHERE doc_type = 'DO' AND status IN ('draft','submitted','approved','in_progress')) AS do_open
    FROM doc.documents
),
below_min AS (
    SELECT COUNT(*) AS cnt
    FROM master.items i
    WHERE i.is_active = TRUE
      AND i.safety_stock > 0
      AND COALESCE((SELECT SUM(b.qty_onhand) FROM inv.stock_balances b WHERE b.item_id = i.id AND b.status = 'available'), 0) < i.safety_stock
),
valuation AS (
    SELECT COALESCE(SUM(iq.qty_onhand * ic.unit_cost), 0) AS total
    FROM (
        SELECT b.item_id, SUM(b.qty_onhand) AS qty_onhand
        FROM inv.stock_balances b
        WHERE b.status = 'available'
        GROUP BY b.item_id
    ) iq
    JOIN (
        SELECT DISTINCT ON (m.item_id) m.item_id, m.unit_cost
        FROM inv.stock_movements m
        WHERE m.unit_cost IS NOT NULL
        ORDER BY m.item_id, m.moved_at DESC, m.id DESC
    ) ic ON ic.item_id = iq.item_id
)
SELECT d.grn_today, d.do_today, d.req_open, d.do_open,
       b.cnt AS below_min_items,
       ROUND(v.total, 2)::float8 AS total_valuation
FROM doc_counts d, below_min b, valuation v;

-- ============ Lampiran Dokumen / GRN attachments (Fase 6 lampiran GRN) ============

-- name: ListAttachmentsByDocument :many
SELECT id, document_id, category, file_name, file_size_bytes, file_url, uploaded_by, created_at
FROM doc.attachments
WHERE document_id = $1
ORDER BY created_at DESC, id DESC;

-- name: CreateAttachment :one
INSERT INTO doc.attachments (document_id, category, file_name, file_size_bytes, file_url, uploaded_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, document_id, category, file_name, file_size_bytes, file_url, uploaded_by, created_at;

-- name: GetAttachmentByID :one
SELECT id, document_id, category, file_name, file_size_bytes, file_url, uploaded_by, created_at
FROM doc.attachments
WHERE id = $1;

-- name: DeleteAttachmentByID :exec
DELETE FROM doc.attachments
WHERE id = $1;
