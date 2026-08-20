-- 000003_seed_data.up.sql
-- Demo/master seed data covering EVERY possible value per FSD §3.2 / PRD:
--   • master: categories, items (all flag combos × ABC A/B/C), item_uoms (base + alt,
--     barcodes), warehouses WH01+WH02, locations (all 6 loc_type values), batches
--     (near-expiry H-90/H-30, expired, future), partners (all 3 partner_type values)
--   • inv: stock_balances (all 5 stock_status values), stock_movements (all 10
--     movement_type values, ledger-consistent: qty_after & balances are the running
--     sum of the movements seeded below)
--   • doc: documents (all 9 doc_type values × all 6 doc_status values, maker-checker
--     respected), document_lines, allocations, deliveries, count_lines, document_numbers
--   • sec: demo users (one per PRD §5 role) + user_roles bindings
--   • aud: sample audit_logs
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING / NOT EXISTS guards).
--
-- All demo users share password:  Simbar@123456  (change after first login!)

-- ================= 1. WAREHOUSES =================
INSERT INTO master.warehouses (code, name, address, is_active) VALUES
    ('WH02', 'Gudang Bandung', 'Jl. Soekarno-Hatta No. 88, Bandung, Jawa Barat', TRUE)
ON CONFLICT (code) DO NOTHING;
-- (WH01 'Gudang Utama' was seeded in 000002_seed_rbac)

-- ================= 2. CATEGORIES =================
INSERT INTO master.categories (code, name, is_active) VALUES
    ('CAT-RAW', 'Bahan Baku',        TRUE),
    ('CAT-PKG', 'Kemasan',           TRUE),
    ('CAT-FG',  'Barang Jadi',       TRUE),
    ('CAT-SPT', 'Spare Part',        TRUE),
    ('CAT-CSM', 'ATK & Konsumabel',  TRUE),
    ('CAT-PHA', 'Farmasi',           TRUE)
ON CONFLICT (code) DO NOTHING;

-- ================= 3. ITEMS =================
-- Covers every flag combination: plain / batch / batch+expiry / serial,
-- and every ABC class (A/B/C). created_by = admin (FK NOT NULL).
INSERT INTO master.items
    (public_id, sku, name, category_id, base_uom, is_batch, is_expiry, is_serial,
     min_qty, max_qty, safety_stock, lead_time_days, abc_class, is_active, created_by)
SELECT gen_random_uuid(), v.sku, v.name, c.id, v.base_uom, v.is_batch, v.is_expiry, v.is_serial,
       v.min_qty, v.max_qty, v.safety_stock, v.lead_time_days, v.abc_class, TRUE, u.id
FROM (VALUES
    ('SKU-001', 'Sari Gandum 500g',        'CAT-FG', 'PCS', TRUE,  TRUE,  FALSE,  50,  500,  20, 3, 'A'),
    ('SKU-002', 'Minyak Goreng 1L',        'CAT-FG', 'PCS', TRUE,  TRUE,  FALSE,  40,  400,  15, 3, 'A'),
    ('SKU-003', 'Beras Premium 5kg',       'CAT-RAW','PCS', TRUE,  FALSE, FALSE, 100, 1000,  50, 7, 'B'),
    ('SKU-004', 'Karton Box 40x30',        'CAT-PKG','PCS', FALSE, FALSE, FALSE, 200, 2000,  80, 5, 'B'),
    ('SKU-005', 'Printer Thermal',         'CAT-SPT','UNIT',FALSE, FALSE, TRUE,    2,   30,   1, 14, 'A'),
    ('SKU-006', 'Barcode Scanner',         'CAT-SPT','UNIT',FALSE, FALSE, FALSE,   1,   10,   0, 14, 'B'),
    ('SKU-007', 'Kabel LAN 10m',           'CAT-CSM','PCS', FALSE, FALSE, FALSE,  20,  300,  10, 5, 'C'),
    ('SKU-008', 'Paracetamol 500mg',       'CAT-PHA','STRIP',TRUE, TRUE,  FALSE, 100, 2000,  60, 5, 'A'),
    ('SKU-009', 'Hand Sanitizer 100ml',    'CAT-CSM','BTL', TRUE,  TRUE,  FALSE,  30,  300,  10, 7, 'C'),
    ('SKU-010', 'Amplop Coklat',           'CAT-CSM','PCS', FALSE, FALSE, FALSE, 100, 3000,  50, 3, 'C')
) AS v(sku, name, cat_code, base_uom, is_batch, is_expiry, is_serial, min_qty, max_qty, safety_stock, lead_time_days, abc_class)
JOIN master.categories c ON c.code = v.cat_code
JOIN sec.users u ON u.username = 'admin'
ON CONFLICT (sku) DO NOTHING;

-- ================= 4. ITEM UOMS (base + alternative, barcodes) =================
INSERT INTO master.item_uoms (item_id, uom, conv_factor, barcode)
SELECT i.id, v.uom, v.conv_factor, v.barcode
FROM (VALUES
    ('SKU-001','PCS',   1.0,  '8991002101001'),
    ('SKU-001','BOX',  24.0,  '8991002101002'),
    ('SKU-002','PCS',   1.0,  '8991002101003'),
    ('SKU-002','KARTON',12.0, '8991002101004'),
    ('SKU-003','BAG',   1.0,  '8991002101005'),
    ('SKU-003','KARUNG',20.0, '8991002101006'),
    ('SKU-004','PCS',   1.0,  '8991002101007'),
    ('SKU-005','UNIT',  1.0,  '8991002101008'),
    ('SKU-006','UNIT',  1.0,  '8991002101009'),
    ('SKU-007','PCS',   1.0,  '8991002101010'),
    ('SKU-007','BOX',  10.0,  '8991002101011'),
    ('SKU-008','STRIP', 1.0,  '8991002101012'),
    ('SKU-008','BOX',  10.0,  '8991002101013'),
    ('SKU-009','BTL',   1.0,  '8991002101014'),
    ('SKU-009','KARTON',24.0, '8991002101015'),
    ('SKU-010','PCS',   1.0,  '8991002101016'),
    ('SKU-010','BOX',  50.0,  '8991002101017')
) AS v(sku, uom, conv_factor, barcode)
JOIN master.items i ON i.sku = v.sku
ON CONFLICT (item_id, uom) DO NOTHING;

-- ================= 5. LOCATIONS (all 6 loc_type values) =================
INSERT INTO master.locations (warehouse_id, code, zone, rack, level, loc_type, pick_seq, capacity, is_active)
SELECT w.id, v.code, v.zone, v.rack, v.level, v.loc_type::inv.location_type, v.pick_seq, v.capacity, TRUE
FROM (VALUES
    -- WH01 — Gudang Utama
    ('WH01','STG-01-01','STG','R01','L1','staging',    NULL,  500),
    ('WH01','PK-01-01', 'PK', 'R01','L1','pick',       1,     1000),
    ('WH01','PK-01-02', 'PK', 'R02','L1','pick',       2,     1000),
    ('WH01','BLK-01-01','BLK','R01','L1','bulk',       NULL,  5000),
    ('WH01','BLK-01-02','BLK','R02','L1','bulk',       NULL,  5000),
    ('WH01','QTN-01-01','QTN','R01','L1','quarantine', NULL,   500),
    ('WH01','DMG-01-01','DMG','R01','L1','damaged',    NULL,   300),
    ('WH01','TRN-01-01','TRN','R01','L1','transit',    NULL,   400),
    -- WH02 — Gudang Bandung
    ('WH02','STG-02-01','STG','R01','L1','staging',    NULL,  300),
    ('WH02','PK-02-01', 'PK', 'R01','L1','pick',       1,     600),
    ('WH02','BLK-02-01','BLK','R01','L1','bulk',       NULL,  3000),
    ('WH02','TRN-02-01','TRN','R01','L1','transit',    NULL,  300)
) AS v(wh_code, code, zone, rack, level, loc_type, pick_seq, capacity)
JOIN master.warehouses w ON w.code = v.wh_code
ON CONFLICT (warehouse_id, code) DO NOTHING;

-- ================= 6. BATCHES =================
-- Includes near-expiry (H-90: B2607B/SKU-001, H-30: B2605A/SKU-008) and
-- already-expired (B2601A/SKU-009) batches to exercise the expiry.alert job.
INSERT INTO master.batches (item_id, batch_no, mfg_date, expiry_date)
SELECT i.id, v.batch_no, v.mfg_date::date, v.expiry_date::date
FROM (VALUES
    ('SKU-001','B2608A','2026-06-01','2027-02-28'),
    ('SKU-001','B2607B','2026-05-10','2026-11-15'),   -- H-90 warning
    ('SKU-002','B2608A','2026-06-15','2027-01-31'),
    ('SKU-003','B2607A','2026-07-01', NULL),
    ('SKU-008','B2605A','2026-05-01','2026-08-31'),   -- H-30 warning
    ('SKU-008','B2606B','2026-06-20','2027-06-30'),
    ('SKU-009','B2601A','2026-01-15','2026-07-31'),   -- EXPIRED
    ('SKU-009','B2607B','2026-07-05','2027-07-05')
) AS v(sku, batch_no, mfg_date, expiry_date)
JOIN master.items i ON i.sku = v.sku
ON CONFLICT (item_id, batch_no) DO NOTHING;

-- ================= 7. PARTNERS (all 3 partner_type values) =================
INSERT INTO master.partners (code, partner_type, name, address, contact_name, contact_phone, is_active)
SELECT v.code, v.partner_type::VARCHAR, v.name, v.address, v.contact_name, v.contact_phone, TRUE
FROM (VALUES
    ('SUP-001','supplier',      'PT Sumber Pangan Sejahtera', 'Jl. Raya Cakung No. 10, Jakarta Timur', 'Hendra Gunawan',  '081234567890'),
    ('SUP-002','supplier',      'PT Teknologi Nusantara',     'Kawasan Industri Jatake, Tangerang',    'Rina Kartika',    '081298765432'),
    ('CUS-001','customer',      'PT Retail Maju Bersama',     'Jl. MH Thamrin No. 1, Jakarta Pusat',   'Bambang Setiawan','082112345678'),
    ('CUS-002','customer',      'Toko Sinar Jaya',            'Jl. Asia Afrika No. 45, Bandung',       'Siti Rahayu',     '082198765432'),
    ('UNIT-001','internal_unit','Unit Produksi Jakarta',      'Kawasan Industri Pulogadung, Jakarta',  'Dedi Kurniawan',  '081356789012'),
    ('UNIT-002','internal_unit','Kantor Pusat',               'Jl. Sudirman No. 55, Jakarta Selatan',  'Maya Lestari',    '081355678901')
) AS v(code, partner_type, name, address, contact_name, contact_phone)
ON CONFLICT (code) DO NOTHING;

-- ================= 8. DEMO USERS (one per PRD §5 role) =================
-- Shared password: Simbar@123456 (Argon2id, FSD §6 parameters)
INSERT INTO sec.users (username, email, full_name, password_hash, is_active)
SELECT v.username, v.username || '@simbar.local', v.full_name,
       '$argon2id$v=19$m=65536,t=3,p=2$1weF3DOHi8tW7k+qiMYZ6A$6oJM2ArVmBACZRomeGtP95CKU2+Fa+LDfa7jzCw5/nE',
       TRUE
FROM (VALUES
    ('imanager',   'Dipo Permana (Inventory Manager)'),
    ('supervisor', 'Budi Haryanto (Supervisor Gudang)'),
    ('receiving',  'Agus Salim (Staf Penerimaan)'),
    ('picker',     'Wawan Kurniawan (Picker/Packer)'),
    ('masterdata', 'Dewi Anggraini (Admin Master Data)'),
    ('courier',    'Joko Susilo (Kurir)'),
    ('requester',  'Sari Dewi (Peminta Barang)'),
    ('auditor',    'Fitri Handayani (Auditor)')
) AS v(username, full_name)
ON CONFLICT (username) DO NOTHING;

-- ================= 9. USER ROLES (warehouse-scoped) =================
INSERT INTO sec.user_roles (user_id, role_id, warehouse_id)
SELECT u.id, r.id, w.id
FROM (VALUES
    ('admin',      'sysadmin',           'WH01'),
    ('admin',      'sysadmin',           'WH02'),
    ('imanager',   'inventory_manager',  'WH01'),
    ('imanager',   'inventory_manager',  'WH02'),
    ('supervisor', 'warehouse_supervisor','WH01'),
    ('receiving',  'receiving_staff',    'WH01'),
    ('picker',     'picker_packer',      'WH01'),
    ('masterdata', 'master_data_admin',  'WH01'),
    ('courier',    'courier',            'WH01'),
    ('requester',  'requester',          'WH01'),
    ('auditor',    'auditor',            'WH01'),
    ('auditor',    'auditor',            'WH02')
) AS v(username, role_code, wh_code)
JOIN sec.users u ON u.username = v.username
JOIN sec.roles r ON r.code = v.role_code
JOIN master.warehouses w ON w.code = v.wh_code
ON CONFLICT DO NOTHING;

-- ================= 10. DOCUMENTS (all 9 doc_type × all 6 doc_status) =================
-- Ledger story (all dates 2026, Asia/Jakarta):
--   07-28  OPN  opening balances both warehouses        (completed)
--   08-03  GRN  receipt SUP-001 + putaway to bins       (completed)
--   08-05  DO   issue to CUS-001                        (completed)
--   08-07  TRF  WH01 → WH02, in-transit stock           (completed)
--   08-10  ADJ  damaged stock −2 (reason: damaged)      (completed)
--   08-10  ADJ  internal bin relocation SKU-007         (completed)
--   08-11  CNT  cycle count session, partially entered  (in_progress)
--   08-12  REQ  request by UNIT-001                     (approved)
--   08-12  DO   allocated from REQ, not shipped         (in_progress)
--   08-12  DO   cancelled by customer                   (cancelled)
--   08-12  RTN_IN return from CUS-002 → staging         (completed)
--   08-13  RTN_OUT expired goods returned to SUP-001    (completed)
--   08-13  GRN  submitted, awaiting approval            (submitted)
--   08-14  GRN  draft, still being entered              (draft)
-- Maker–checker (BR-05) respected: approved_by <> created_by on every doc.
INSERT INTO doc.documents
    (public_id, doc_no, doc_type, doc_date, status, warehouse_id, dest_warehouse_id,
     partner_id, ref_doc_id, reason_code, notes, idempotency_key,
     created_at, created_by, submitted_at, approved_at, approved_by, completed_at)
SELECT gen_random_uuid(), v.doc_no, v.doc_type::doc.doc_type, v.doc_date::date, v.status::doc.doc_status,
       w.id, wd.id, p.id, rd.id, v.reason_code, v.notes, v.idempotency_key,
       v.created_at::timestamptz, cu.id, v.submitted_at::timestamptz,
       v.approved_at::timestamptz, au.id, v.completed_at::timestamptz
FROM (VALUES
    ('OPN/WH01/2608/00001', 'OPN', '2026-07-28', 'completed',    'WH01', NULL, NULL, NULL, NULL,
        'Saldo awal gudang utama hasil opname 2026-07-28', NULL,
        '2026-07-28 08:00:00+07', 'admin',      NULL, '2026-07-28 08:10:00+07', 'imanager',   '2026-07-28 08:10:00+07'),
    ('OPN/WH02/2608/00001', 'OPN', '2026-07-28', 'completed',    'WH02', NULL, NULL, NULL, NULL,
        'Saldo awal gudang Bandung hasil opname 2026-07-28', NULL,
        '2026-07-28 08:30:00+07', 'admin',      NULL, '2026-07-28 08:40:00+07', 'imanager',   '2026-07-28 08:40:00+07'),
    ('GRN/WH01/2608/00002', 'GRN', '2026-08-03', 'completed',    'WH01', NULL, 'SUP-001', NULL, NULL,
        'Penerimaan PO/2026/0331', '9f8a7b6c-5d4e-4a3b-9c8d-1f2e3d4c5b6a',
        '2026-08-03 10:00:00+07', 'receiving',  '2026-08-03 10:05:00+07', '2026-08-03 10:10:00+07', 'supervisor', '2026-08-03 11:00:00+07'),
    ('DO/WH01/2608/00003',   'DO', '2026-08-05', 'completed',    'WH01', NULL, 'CUS-001', NULL, NULL,
        'Pengiriman rutin minggu pertama', NULL,
        '2026-08-05 09:00:00+07', 'supervisor', '2026-08-05 09:10:00+07', '2026-08-05 09:30:00+07', 'imanager',   '2026-08-05 14:30:00+07'),
    ('TRF/WH01/2608/00004',  'TRF', '2026-08-07', 'completed',    'WH01', 'WH02', NULL, NULL, NULL,
        'Kirim beras ke gudang Bandung', NULL,
        '2026-08-07 08:30:00+07', 'supervisor', '2026-08-07 08:40:00+07', '2026-08-07 08:55:00+07', 'imanager',   '2026-08-08 08:30:00+07'),
    ('ADJ/WH01/2608/00006',  'ADJ', '2026-08-10', 'completed',    'WH01', NULL, NULL, NULL, 'damaged',
        'Ditemukan kabel rusak saat pemeriksaan rutin', NULL,
        '2026-08-10 12:45:00+07', 'supervisor', '2026-08-10 12:50:00+07', '2026-08-10 13:00:00+07', 'imanager',   '2026-08-10 13:00:00+07'),
    ('ADJ/WH01/2608/00013',  'ADJ', '2026-08-10', 'completed',    'WH01', NULL, NULL, NULL, 'relocation',
        'Pemindahan internal SKU-007 dari bulk ke zona pick', NULL,
        '2026-08-10 13:45:00+07', 'supervisor', '2026-08-10 13:50:00+07', '2026-08-10 14:00:00+07', 'imanager',   '2026-08-10 14:05:00+07'),
    ('CNT/WH01/2608/00007',  'CNT', '2026-08-11', 'in_progress', 'WH01', NULL, NULL, NULL, NULL,
        'Cycle count kelas A (bulanan)', NULL,
        '2026-08-11 07:30:00+07', 'supervisor', NULL, NULL, NULL, NULL),
    ('REQ/WH01/2608/00008',  'REQ', '2026-08-12', 'approved',     'WH01', NULL, 'UNIT-001', NULL, NULL,
        'Permintaan unit produksi minggu ke-3', NULL,
        '2026-08-12 08:15:00+07', 'requester',  '2026-08-12 08:20:00+07', '2026-08-12 09:00:00+07', 'supervisor', NULL),
    ('DO/WH01/2608/00014',   'DO', '2026-08-12', 'in_progress',  'WH01', NULL, 'CUS-001', NULL, NULL,
        'DO dari permintaan REQ 00008 — sudah dialokasi, menunggu picking', NULL,
        '2026-08-12 09:30:00+07', 'supervisor', '2026-08-12 09:35:00+07', '2026-08-12 09:40:00+07', 'imanager',   NULL),
    ('DO/WH01/2608/00012',   'DO', '2026-08-12', 'cancelled',     'WH01', NULL, 'CUS-002', NULL, 'cancelled_by_customer',
        'Dibatalkan atas permintaan pelanggan', NULL,
        '2026-08-12 10:00:00+07', 'supervisor', NULL, NULL, NULL, NULL),
    ('RTN_IN/WH01/2608/00009', 'RTN_IN', '2026-08-12', 'completed', 'WH01', NULL, 'CUS-002', NULL, NULL,
        'Retur karton box dari Toko Sinar Jaya — ref DO 00003', NULL,
        '2026-08-12 15:30:00+07', 'receiving',  '2026-08-12 16:00:00+07', '2026-08-13 09:00:00+07', 'supervisor', '2026-08-13 10:00:00+07'),
    ('RTN_OUT/WH01/2608/00010', 'RTN_OUT', '2026-08-13', 'completed', 'WH01', NULL, 'SUP-001', NULL, NULL,
        'Retur hand sanitizer kedaluwarsa ke pemasok (20 dari 30)', NULL,
        '2026-08-13 14:30:00+07', 'receiving',  '2026-08-13 14:40:00+07', '2026-08-13 15:00:00+07', 'supervisor', '2026-08-13 15:30:00+07'),
    ('GRN/WH01/2608/00015',  'GRN', '2026-08-13', 'submitted',    'WH01', NULL, 'SUP-002', NULL, NULL,
        'Restok printer thermal — menunggu verifikasi fisik', NULL,
        '2026-08-13 11:00:00+07', 'receiving',  '2026-08-13 11:10:00+07', NULL, NULL, NULL),
    ('GRN/WH01/2608/00011',  'GRN', '2026-08-14', 'draft',        'WH01', NULL, 'SUP-002', NULL, NULL,
        'Draft penerimaan barang (belum lengkap)', NULL,
        '2026-08-14 09:00:00+07', 'receiving',  NULL, NULL, NULL, NULL)
) AS v(doc_no, doc_type, doc_date, status, wh_code, dest_wh_code, partner_code, ref_doc_no, reason_code, notes, idempotency_key,
       created_at, creator, submitted_at, approved_at, approver, completed_at)
JOIN master.warehouses w ON w.code = v.wh_code
LEFT JOIN master.warehouses wd ON wd.code = v.dest_wh_code
LEFT JOIN master.partners p ON p.code = v.partner_code
LEFT JOIN doc.documents rd ON rd.doc_no = v.ref_doc_no
JOIN sec.users cu ON cu.username = v.creator
LEFT JOIN sec.users au ON au.username = v.approver
ON CONFLICT (doc_no) DO NOTHING;

-- ================= 11. DOCUMENT LINES =================
INSERT INTO doc.document_lines
    (document_id, line_no, item_id, uom, conv_factor, qty_request, qty_processed,
     batch_id, location_id, status, notes)
SELECT d.id, v.line_no, i.id, v.uom, v.conv_factor, v.qty_request, v.qty_processed,
       b.id, l.id, v.status::inv.stock_status, v.notes
FROM (VALUES
    -- OPN WH01 (12)
    ('OPN/WH01/2608/00001', 1,  'SKU-001', 'PCS',   1.0,  180, 180, 'B2608A', 'PK-01-01',  'available',  NULL),
    ('OPN/WH01/2608/00001', 2,  'SKU-001', 'PCS',   1.0,  120, 120, 'B2607B', 'BLK-01-01', 'available',  NULL),
    ('OPN/WH01/2608/00001', 3,  'SKU-002', 'PCS',   1.0,   96,  96, 'B2608A', 'PK-01-02',  'available',  NULL),
    ('OPN/WH01/2608/00001', 4,  'SKU-003', 'BAG',   1.0,  300, 300, 'B2607A', 'BLK-01-01', 'available',  NULL),
    ('OPN/WH01/2608/00001', 5,  'SKU-004', 'PCS',   1.0,  500, 500, NULL,     'BLK-01-02', 'available',  NULL),
    ('OPN/WH01/2608/00001', 6,  'SKU-005', 'UNIT',  1.0,   10,  10, NULL,     'PK-01-02',  'available',  NULL),
    ('OPN/WH01/2608/00001', 7,  'SKU-006', 'UNIT',  1.0,    5,   5, NULL,     'BLK-01-02', 'available',  NULL),
    ('OPN/WH01/2608/00001', 8,  'SKU-007', 'PCS',   1.0,   80,  80, NULL,     'BLK-01-01', 'available',  NULL),
    ('OPN/WH01/2608/00001', 9,  'SKU-008', 'STRIP', 1.0,  500, 500, 'B2605A', 'PK-01-01',  'available',  NULL),
    ('OPN/WH01/2608/00001', 10, 'SKU-008', 'STRIP', 1.0,  200, 200, 'B2606B', 'QTN-01-01', 'quarantine', 'Hasil QC ditahan'),
    ('OPN/WH01/2608/00001', 11, 'SKU-009', 'BTL',   1.0,   30,  30, 'B2601A', 'DMG-01-01', 'expired',    'Kedaluwarsa saat opname'),
    ('OPN/WH01/2608/00001', 12, 'SKU-006', 'UNIT',  1.0,    1,   1, NULL,     'DMG-01-01', 'damaged',    'Rusak saat opname'),
    ('OPN/WH01/2608/00001', 13, 'SKU-009', 'BTL',   1.0,   60,  60, 'B2607B', 'BLK-01-02', 'available',  NULL),
    -- OPN WH02 (2)
    ('OPN/WH02/2608/00001', 1,  'SKU-001', 'PCS',   1.0,   60,  60, 'B2608A', 'PK-02-01',  'available',  NULL),
    ('OPN/WH02/2608/00001', 2,  'SKU-007', 'PCS',   1.0,   40,  40, NULL,     'BLK-02-01', 'available',  NULL),
    -- GRN 00002 (4: 2 receipt ke staging + 2 putaway ke bin)
    ('GRN/WH01/2608/00002', 1,  'SKU-004', 'PCS',   1.0,   50,  50, NULL,     'STG-01-01', 'available',  'Diterima di staging'),
    ('GRN/WH01/2608/00002', 2,  'SKU-009', 'BTL',   1.0,   60,  60, 'B2607B', 'STG-01-01', 'available',  'Diterima di staging'),
    ('GRN/WH01/2608/00002', 3,  'SKU-004', 'PCS',   1.0,   50,  50, NULL,     'BLK-01-02', 'available',  'Putaway staging → bulk'),
    ('GRN/WH01/2608/00002', 4,  'SKU-009', 'BTL',   1.0,   60,  60, 'B2607B', 'BLK-01-02', 'available',  'Putaway staging → bulk'),
    -- DO 00003 (2, posted)
    ('DO/WH01/2608/00003',  1,  'SKU-002', 'PCS',   1.0,   12,  12, 'B2608A', 'PK-01-02',  'available',  NULL),
    ('DO/WH01/2608/00003',  2,  'SKU-008', 'STRIP', 1.0,   40,  40, 'B2605A', 'PK-01-01',  'available',  NULL),
    -- TRF 00004 (1, sent + received)
    ('TRF/WH01/2608/00004', 1,  'SKU-003', 'BAG',   1.0,  100, 100, 'B2607A', 'BLK-01-01', 'available',  'Transfer ke WH02'),
    -- ADJ 00006 (1)
    ('ADJ/WH01/2608/00006', 1,  'SKU-007', 'PCS',   1.0,    2,   2, NULL,     'BLK-01-01', 'available',  'Rusak'),
    -- ADJ 00013 (2, relocation / internal move)
    ('ADJ/WH01/2608/00013', 1,  'SKU-007', 'PCS',   1.0,    2,   2, NULL,     'BLK-01-01', 'available',  'Keluar dari BLK-01-01'),
    ('ADJ/WH01/2608/00013', 2,  'SKU-007', 'PCS',   1.0,    2,   2, NULL,     'PK-01-02',  'available',  'Masuk ke PK-01-02 (fast-mover)'),
    -- RTN_IN 00009 (1, posted ke staging)
    ('RTN_IN/WH01/2608/00009', 1, 'SKU-004', 'PCS',  1.0,    5,   5, NULL,     'STG-01-01', 'available',  'Retur pelanggan'),
    -- RTN_OUT 00010 (1, posted)
    ('RTN_OUT/WH01/2608/00010', 1, 'SKU-009','BTL',  1.0,   20,  20, 'B2601A', 'DMG-01-01', 'expired',    'Retur expired ke pemasok'),
    -- GRN 00011 (1, draft — no movements)
    ('GRN/WH01/2608/00011', 1,  'SKU-005', 'UNIT',  1.0,    5,   0, NULL,     NULL,        'available',  NULL),
    -- DO 00012 (1, cancelled — no movements)
    ('DO/WH01/2608/00012',  1,  'SKU-006', 'UNIT',  1.0,    2,   0, NULL,     NULL,        'available',  NULL),
    -- DO 00014 (2, allocated — reserved, not picked)
    ('DO/WH01/2608/00014',  1,  'SKU-002', 'PCS',   1.0,   24,   0, 'B2608A', 'PK-01-02',  'available',  'Dialokasikan dari REQ 00008'),
    ('DO/WH01/2608/00014',  2,  'SKU-007', 'PCS',   1.0,   10,   0, NULL,     'BLK-01-01', 'available',  'Dialokasikan dari REQ 00008'),
    -- REQ 00008 (2, request by unit — no movements until a DO is created)
    ('REQ/WH01/2608/00008', 1,  'SKU-002', 'PCS',   1.0,   24,   0, 'B2608A', NULL,        'available',  'Permintaan unit produksi'),
    ('REQ/WH01/2608/00008', 2,  'SKU-007', 'PCS',   1.0,   10,   0, NULL,     NULL,        'available',  'Permintaan unit produksi'),
    -- GRN 00015 (1, submitted — no movements yet)
    ('GRN/WH01/2608/00015', 1,  'SKU-001', 'PCS',   1.0,  120,   0, 'B2608A', NULL,        'available',  NULL)
) AS v(doc_no, line_no, sku, uom, conv_factor, qty_request, qty_processed, batch_no, loc_code, status, notes)
JOIN doc.documents d ON d.doc_no = v.doc_no
JOIN master.items i ON i.sku = v.sku
LEFT JOIN master.batches b ON b.item_id = i.id AND b.batch_no = v.batch_no
LEFT JOIN master.locations l ON l.code = v.loc_code
ON CONFLICT (document_id, line_no) DO NOTHING;

-- ================= 12. STOCK MOVEMENTS (all 10 movement_type, ledger-consistent) =================
-- Invariant: for each (item, location, batch, status) key, the running qty_after
-- in this file equals the final qty_onhand in stock_balances below.

-- 12a. OPN — 'opening' (+qty, qty_after = qty since all keys are fresh)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT d.created_at + INTERVAL '30 minutes', dl.item_id, dl.location_id, dl.batch_id,
       dl.status, 'opening', dl.qty_request, dl.qty_request, NULL, dl.id, d.doc_no, cu.id
FROM doc.document_lines dl
JOIN doc.documents d ON d.id = dl.document_id
JOIN sec.users cu ON cu.username = 'admin'
WHERE d.doc_type = 'OPN'
  AND NOT EXISTS (
      SELECT 1 FROM inv.stock_movements m
      WHERE m.doc_line_id = dl.id AND m.movement_type = 'opening'
  );

-- 12b. GRN 00002 — 'receipt' into staging (fresh keys → qty_after = qty)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT d.created_at + INTERVAL '15 minutes', dl.item_id, dl.location_id, dl.batch_id,
       dl.status, 'receipt', dl.qty_request, dl.qty_request, NULL, dl.id, d.doc_no, cu.id
FROM doc.document_lines dl
JOIN doc.documents d ON d.id = dl.document_id
JOIN sec.users cu ON cu.username = 'receiving'
WHERE d.doc_no = 'GRN/WH01/2608/00002' AND dl.line_no IN (1, 2)
  AND NOT EXISTS (
      SELECT 1 FROM inv.stock_movements m
      WHERE m.doc_line_id = dl.id AND m.movement_type = 'receipt'
  );

-- 12c. GRN 00002 — 'putaway' (out of staging, into bin; per-line pair)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT v.moved_at::timestamptz, dl.item_id, l.id, dl.batch_id, 'available', 'putaway', v.qty, v.qty_after,
       NULL, dl.id, d.doc_no, cu.id
FROM (VALUES
    -- line 3: SKU-004 staging → BLK-01-02 (50 → 0 | 500 → 550)
    ('GRN/WH01/2608/00002', 3, 'STG-01-01', -50,    0, '2026-08-03 11:00:00+07'),
    ('GRN/WH01/2608/00002', 3, 'BLK-01-02',  50,  550, '2026-08-03 11:05:00+07'),
    -- line 4: SKU-009 B2607B staging → BLK-01-02 (60 → 0 | 60 → 120)
    ('GRN/WH01/2608/00002', 4, 'STG-01-01', -60,    0, '2026-08-03 11:05:00+07'),
    ('GRN/WH01/2608/00002', 4, 'BLK-01-02',  60,  120, '2026-08-03 11:10:00+07')
) AS v(doc_no, line_no, loc_code, qty, qty_after, moved_at)
JOIN doc.documents d ON d.doc_no = v.doc_no
JOIN doc.document_lines dl ON dl.document_id = d.id AND dl.line_no = v.line_no
JOIN master.locations l ON l.code = v.loc_code
JOIN sec.users cu ON cu.username = 'receiving'
WHERE NOT EXISTS (
    SELECT 1 FROM inv.stock_movements m
    WHERE m.doc_line_id = dl.id AND m.movement_type = 'putaway'
      AND m.location_id = l.id AND m.qty = v.qty AND m.qty_after = v.qty_after
);

-- 12d. DO 00003 — 'issue' (shipped)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT v.moved_at::timestamptz, dl.item_id, dl.location_id, dl.batch_id, 'available', 'issue', v.qty, v.qty_after,
       NULL, dl.id, d.doc_no, cu.id
FROM (VALUES
    ('DO/WH01/2608/00003', 1, -12,  84, '2026-08-05 14:30:00+07'),
    ('DO/WH01/2608/00003', 2, -40, 460, '2026-08-05 14:30:00+07')
) AS v(doc_no, line_no, qty, qty_after, moved_at)
JOIN doc.documents d ON d.doc_no = v.doc_no
JOIN doc.document_lines dl ON dl.document_id = d.id AND dl.line_no = v.line_no
JOIN sec.users cu ON cu.username = 'supervisor'
WHERE NOT EXISTS (
    SELECT 1 FROM inv.stock_movements m
    WHERE m.doc_line_id = dl.id AND m.movement_type = 'issue' AND m.qty_after = v.qty_after
);

-- 12e. TRF 00004 — 'transfer_out' (WH01, −100 → 200) + 'transfer_in' (WH02 transit, +100 → 100)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT v.moved_at::timestamptz, dl.item_id, l.id, dl.batch_id, v.status::inv.stock_status, v.movement_type::inv.movement_type, v.qty, v.qty_after,
       NULL, dl.id, d.doc_no, cu.id
FROM (VALUES
    ('TRF/WH01/2608/00004', 'BLK-01-01', 'available', 'transfer_out', -100, 200, '2026-08-07 09:00:00+07'),
    ('TRF/WH01/2608/00004', 'TRN-02-01', 'in_transit', 'transfer_in', +100, 100, '2026-08-08 08:30:00+07')
) AS v(doc_no, loc_code, status, movement_type, qty, qty_after, moved_at)
JOIN doc.documents d ON d.doc_no = v.doc_no
JOIN doc.document_lines dl ON dl.document_id = d.id AND dl.line_no = 1
JOIN master.locations l ON l.code = v.loc_code
JOIN sec.users cu ON cu.username = 'supervisor'
WHERE NOT EXISTS (
    SELECT 1 FROM inv.stock_movements m
    WHERE m.doc_line_id = dl.id AND m.movement_type = v.movement_type::inv.movement_type AND m.qty_after = v.qty_after
);

-- 12f. ADJ 00006 — 'adjustment' (damaged, −2 → 78)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT '2026-08-10 13:00:00+07', dl.item_id, dl.location_id, dl.batch_id, 'available',
       'adjustment', -2, 78, NULL, dl.id, d.doc_no, cu.id
FROM doc.documents d
JOIN doc.document_lines dl ON dl.document_id = d.id AND dl.line_no = 1
JOIN sec.users cu ON cu.username = 'supervisor'
WHERE d.doc_no = 'ADJ/WH01/2608/00006'
  AND NOT EXISTS (
      SELECT 1 FROM inv.stock_movements m
      WHERE m.doc_line_id = dl.id AND m.movement_type = 'adjustment'
  );

-- 12g. ADJ 00013 — 'internal_move' (relocation: −2 → 76, +2 → 2)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT v.moved_at::timestamptz, dl.item_id, l.id, NULL, 'available', 'internal_move', v.qty, v.qty_after,
       NULL, dl.id, d.doc_no, cu.id
FROM (VALUES
    ('ADJ/WH01/2608/00013', 1, 'BLK-01-01', -2,  76, '2026-08-10 14:00:00+07'),
    ('ADJ/WH01/2608/00013', 2, 'PK-01-02',  +2,   2, '2026-08-10 14:05:00+07')
) AS v(doc_no, line_no, loc_code, qty, qty_after, moved_at)
JOIN doc.documents d ON d.doc_no = v.doc_no
JOIN doc.document_lines dl ON dl.document_id = d.id AND dl.line_no = v.line_no
JOIN master.locations l ON l.code = v.loc_code
JOIN sec.users cu ON cu.username = 'supervisor'
WHERE NOT EXISTS (
    SELECT 1 FROM inv.stock_movements m
    WHERE m.doc_line_id = dl.id AND m.movement_type = 'internal_move'
      AND m.location_id = l.id AND m.qty_after = v.qty_after
);

-- 12h. RTN_IN 00009 — 'return_in' (+5 → 5, staging)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT '2026-08-13 10:00:00+07', dl.item_id, dl.location_id, dl.batch_id, 'available',
       'return_in', 5, 5, NULL, dl.id, d.doc_no, cu.id
FROM doc.documents d
JOIN doc.document_lines dl ON dl.document_id = d.id AND dl.line_no = 1
JOIN sec.users cu ON cu.username = 'receiving'
WHERE d.doc_no = 'RTN_IN/WH01/2608/00009'
  AND NOT EXISTS (
      SELECT 1 FROM inv.stock_movements m
      WHERE m.doc_line_id = dl.id AND m.movement_type = 'return_in'
  );

-- 12i. RTN_OUT 00010 — 'return_out' (−20 → 10, expired)
INSERT INTO inv.stock_movements
    (moved_at, item_id, location_id, batch_id, status, movement_type, qty, qty_after,
     unit_cost, doc_line_id, doc_no, created_by)
SELECT '2026-08-13 15:30:00+07', dl.item_id, dl.location_id, dl.batch_id, 'expired',
       'return_out', -20, 10, NULL, dl.id, d.doc_no, cu.id
FROM doc.documents d
JOIN doc.document_lines dl ON dl.document_id = d.id AND dl.line_no = 1
JOIN sec.users cu ON cu.username = 'receiving'
WHERE d.doc_no = 'RTN_OUT/WH01/2608/00010'
  AND NOT EXISTS (
      SELECT 1 FROM inv.stock_movements m
      WHERE m.doc_line_id = dl.id AND m.movement_type = 'return_out'
  );

-- ================= 13. STOCK BALANCES (final state — mirrors the movement ledger) =================
INSERT INTO inv.stock_balances (item_id, location_id, batch_id, status, qty_onhand, qty_reserved, updated_at)
SELECT i.id, l.id, b.id, v.status::inv.stock_status, v.qty_onhand, v.qty_reserved, v.updated_at::timestamptz
FROM (VALUES
    -- WH01
    ('SKU-001','PK-01-01','B2608A','available', 180,  0, '2026-07-28 09:30:00+07'),
    ('SKU-001','BLK-01-01','B2607B','available',120,  0, '2026-07-28 09:30:00+07'),
    ('SKU-002','PK-01-02','B2608A','available', 84, 24, '2026-08-12 09:40:00+07'),
    ('SKU-003','BLK-01-01','B2607A','available',200,  0, '2026-08-08 08:30:00+07'),
    ('SKU-004','BLK-01-02', NULL,    'available',550,  0, '2026-08-03 11:10:00+07'),
    ('SKU-004','STG-01-01', NULL,    'available',  5,  0, '2026-08-13 10:00:00+07'),
    ('SKU-005','PK-01-02',  NULL,    'available', 10,  0, '2026-07-28 09:30:00+07'),
    ('SKU-006','BLK-01-02', NULL,    'available',  5,  0, '2026-07-28 09:30:00+07'),
    ('SKU-006','DMG-01-01', NULL,    'damaged',    1,  0, '2026-07-28 09:30:00+07'),
    ('SKU-007','BLK-01-01', NULL,    'available', 76, 10, '2026-08-12 09:40:00+07'),
    ('SKU-007','PK-01-02',  NULL,    'available',  2,  0, '2026-08-10 14:05:00+07'),
    ('SKU-008','PK-01-01','B2605A','available',460,  0, '2026-08-05 14:30:00+07'),
    ('SKU-008','QTN-01-01','B2606B','quarantine',200, 0, '2026-07-28 09:30:00+07'),
    ('SKU-009','DMG-01-01','B2601A','expired',   10,  0, '2026-08-13 15:30:00+07'),
    ('SKU-009','BLK-01-02','B2607B','available',120,  0, '2026-08-03 11:10:00+07'),
    -- WH02
    ('SKU-001','PK-02-01','B2608A','available', 60,  0, '2026-07-28 09:30:00+07'),
    ('SKU-003','TRN-02-01','B2607A','in_transit',100, 0, '2026-08-08 08:30:00+07'),
    ('SKU-007','BLK-02-01', NULL,    'available', 40,  0, '2026-07-28 09:30:00+07')
) AS v(sku, loc_code, batch_no, status, qty_onhand, qty_reserved, updated_at)
JOIN master.items i ON i.sku = v.sku
JOIN master.locations l ON l.code = v.loc_code
LEFT JOIN master.batches b ON b.item_id = i.id AND b.batch_no = v.batch_no
ON CONFLICT (item_id, location_id, COALESCE(batch_id, 0), status) DO NOTHING;

-- ================= 14. ALLOCATIONS (DO 00003 picked; DO 00014 reserved) =================
INSERT INTO doc.allocations (doc_line_id, balance_id, qty_allocated, qty_picked, created_at)
SELECT dl.id, bal.id, v.qty_allocated, v.qty_picked, v.created_at::timestamptz
FROM (VALUES
    ('DO/WH01/2608/00003', 1, 'SKU-002','PK-01-02','B2608A','available', 12, 12, '2026-08-05 09:40:00+07'),
    ('DO/WH01/2608/00003', 2, 'SKU-008','PK-01-01','B2605A','available', 40, 40, '2026-08-05 09:40:00+07'),
    ('DO/WH01/2608/00014', 1, 'SKU-002','PK-01-02','B2608A','available', 24,  0, '2026-08-12 09:40:00+07'),
    ('DO/WH01/2608/00014', 2, 'SKU-007','BLK-01-01', NULL,    'available', 10,  0, '2026-08-12 09:40:00+07')
) AS v(doc_no, line_no, sku, loc_code, batch_no, status, qty_allocated, qty_picked, created_at)
JOIN doc.documents d ON d.doc_no = v.doc_no
JOIN doc.document_lines dl ON dl.document_id = d.id AND dl.line_no = v.line_no
JOIN master.items i ON i.sku = v.sku
JOIN master.locations l ON l.code = v.loc_code
LEFT JOIN master.batches bt ON bt.item_id = i.id AND bt.batch_no = v.batch_no
JOIN inv.stock_balances bal ON bal.item_id = i.id AND bal.location_id = l.id
     AND COALESCE(bal.batch_id, 0) = COALESCE(bt.id, 0) AND bal.status = v.status::inv.stock_status
ON CONFLICT DO NOTHING;

-- ================= 15. DELIVERIES (DO 00003 shipped + POD) =================
INSERT INTO doc.deliveries (document_id, vehicle_no, driver_name, shipped_at, received_by, received_at)
SELECT d.id, 'B 1234 XYZ', 'Budi Santoso', '2026-08-05 10:00:00+07',
       'Andi Wijaya', '2026-08-05 14:30:00+07'
FROM doc.documents d
WHERE d.doc_no = 'DO/WH01/2608/00003'
ON CONFLICT (document_id) DO NOTHING;

-- ================= 16. COUNT LINES (CNT 00007 — blind count, one variance) =================
INSERT INTO doc.count_lines (document_id, item_id, location_id, batch_id, qty_system, qty_counted, reason_code, counted_by, counted_at)
SELECT d.id, i.id, l.id, b.id, v.qty_system, v.qty_counted, v.reason_code, cu.id, v.counted_at::timestamptz
FROM (VALUES
    ('SKU-001','PK-01-01','B2608A', 180, 180, NULL,           '2026-08-11 08:00:00+07'),
    ('SKU-002','PK-01-02','B2608A',  96,  95, 'selisih_opname','2026-08-11 08:30:00+07')
) AS v(sku, loc_code, batch_no, qty_system, qty_counted, reason_code, counted_at)
JOIN doc.documents d ON d.doc_no = 'CNT/WH01/2608/00007'
JOIN master.items i ON i.sku = v.sku
JOIN master.locations l ON l.code = v.loc_code
JOIN master.batches b ON b.item_id = i.id AND b.batch_no = v.batch_no
JOIN sec.users cu ON cu.username = 'picker'
ON CONFLICT DO NOTHING;

-- ================= 17. DOCUMENT NUMBERS (continue from seeded sequences) =================
INSERT INTO doc.document_numbers (doc_type, period, last_seq)
SELECT v.doc_type::doc.doc_type, '2608', v.last_seq
FROM (VALUES
    ('GRN', 15), ('DO', 14), ('TRF', 4), ('ADJ', 13),
    ('RTN_IN', 9), ('RTN_OUT', 10), ('CNT', 7), ('OPN', 2), ('REQ', 8)
) AS v(doc_type, last_seq)
ON CONFLICT (doc_type, period)
DO UPDATE SET last_seq = GREATEST(doc.document_numbers.last_seq, EXCLUDED.last_seq);

-- ================= 18. AUDIT LOGS (sample trail with fixed request_ids) =================
INSERT INTO aud.audit_logs (occurred_at, user_id, action, entity, entity_id, old_value, new_value, ip_address, request_id)
SELECT v.occurred_at::timestamptz, u.id, v.action, v.entity, v.entity_id, v.old_value::jsonb, v.new_value::jsonb,
       v.ip_address::inet, v.request_id::uuid
FROM (VALUES
    ('2026-08-14 08:00:00+07', 'admin',      'LOGIN',   'user',      NULL, NULL,
        '{"username":"admin"}'::jsonb,        '10.0.0.10', '00000000-0000-0000-0000-000000000001'),
    ('2026-08-13 09:05:00+07', 'masterdata', 'CREATE',  'item',      1,    NULL,
        '{"sku":"SKU-001"}'::jsonb,           '10.0.0.11', '00000000-0000-0000-0000-000000000002'),
    ('2026-08-03 10:10:00+07', 'supervisor', 'APPROVE', 'GRN',       3,    NULL,
        '{"doc_no":"GRN/WH01/2608/00002"}'::jsonb, '10.0.0.12', '00000000-0000-0000-0000-000000000003'),
    ('2026-08-05 14:30:00+07', 'supervisor', 'POST',    'DO',        4,    NULL,
        '{"doc_no":"DO/WH01/2608/00003"}'::jsonb, '10.0.0.12', '00000000-0000-0000-0000-000000000004'),
    ('2026-08-12 09:40:00+07', 'supervisor', 'CREATE',  'document',  14,   NULL,
        '{"doc_no":"DO/WH01/2608/00014"}'::jsonb, '10.0.0.12', '00000000-0000-0000-0000-000000000005'),
    ('2026-08-12 08:15:00+07', 'requester',  'LOGIN',   'user',      NULL, NULL,
        '{"username":"requester"}'::jsonb,    '10.0.0.13', '00000000-0000-0000-0000-000000000006')
) AS v(occurred_at, username, action, entity, entity_id, old_value, new_value, ip_address, request_id)
JOIN sec.users u ON u.username = v.username
ON CONFLICT DO NOTHING;

-- ================= DONE =================
SELECT '000003_seed_data applied: ' || COUNT(*) || ' stock movements seeded' AS seed_status
FROM inv.stock_movements;
