-- 000002_seed_rbac.up.sql
-- Seed data for RBAC (Fase 2.4): default warehouse, roles, permissions,
-- role_permissions mapping, and a bootstrap admin user.
-- Idempotent: safe to re-run.

-- 1. Default warehouse (required for warehouse-scoped policies & login)
INSERT INTO master.warehouses (code, name, address, is_active)
VALUES ('WH01', 'Gudang Utama', 'Jakarta', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. Roles (PRD §5)
INSERT INTO sec.roles (code, name) VALUES
    ('sysadmin',           'Administrator Sistem'),
    ('inventory_manager',  'Inventory Manager'),
    ('warehouse_supervisor','Supervisor Gudang'),
    ('receiving_staff',    'Staf Penerimaan'),
    ('picker_packer',      'Picker / Packer'),
    ('master_data_admin',  'Admin Master Data'),
    ('courier',            'Kurir'),
    ('requester',          'Peminta Barang'),
    ('auditor',            'Auditor / Keuangan')
ON CONFLICT (code) DO NOTHING;

-- 3. Permissions (concrete per FSD §5.2 — resource.action)
INSERT INTO sec.permissions (code) VALUES
    ('item.read'),      ('item.write'),     ('item.import'),
    ('location.read'),  ('location.write'),
    ('partner.read'),   ('partner.write'),
    ('stock.read'),
    ('grn.create'),     ('grn.read'),       ('grn.approve'),
    ('do.create'),      ('do.read'),        ('do.approve'),
    ('transfer.create'),('transfer.read'),  ('transfer.approve'),
    ('request.create'), ('request.read'),   ('request.approve'),
    ('count.create'),   ('count.execute'),  ('count.approve'),
    ('adj.create'),     ('adj.read'),       ('adj.approve'),
    ('report.read'),    ('dashboard.read'), ('audit.read')
ON CONFLICT (code) DO NOTHING;

-- 4. Role → permission mapping
INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'sysadmin'
ON CONFLICT DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'inventory_manager'
ON CONFLICT DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'warehouse_supervisor'
  AND p.code IN (
      'item.read','item.write','location.read','location.write',
      'partner.read','partner.write','stock.read',
      'grn.read','grn.approve','do.read','do.approve',
      'transfer.read','transfer.approve',
      'request.read','request.approve',
      'count.create','count.execute','count.approve',
      'adj.read','adj.approve','report.read','dashboard.read'
  )
ON CONFLICT DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'receiving_staff'
  AND p.code IN ('item.read','location.read','partner.read','stock.read','grn.create','grn.read')
ON CONFLICT DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'picker_packer'
  AND p.code IN ('item.read','location.read','stock.read','do.read')
ON CONFLICT DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'master_data_admin'
  AND p.code IN ('item.read','item.write','item.import','location.read','location.write','partner.read','partner.write')
ON CONFLICT DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'courier'
  AND p.code = 'do.read'
ON CONFLICT DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'requester'
  AND p.code IN ('item.read','stock.read','request.create','request.read')
ON CONFLICT DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'auditor'
  AND p.code IN ('item.read','location.read','partner.read','stock.read','report.read','dashboard.read','audit.read')
ON CONFLICT DO NOTHING;

-- 5. Bootstrap admin user (Argon2id hash of "Admin@123456" — change after first login!)
INSERT INTO sec.users (username, email, full_name, password_hash, is_active)
VALUES (
    'admin',
    'admin@simbar.local',
    'Administrator SIMBAR',
    '$argon2id$v=19$m=65536,t=3,p=2$CYV0M6Wv9WJabKdSW86KIg$jwLqoiedv/VVnP9nW+ilNV3H1fpSCQYr7hFo86cgHkk',
    TRUE
)
ON CONFLICT (username) DO NOTHING;

-- 6. Bind admin → sysadmin @ WH01
INSERT INTO sec.user_roles (user_id, role_id, warehouse_id)
SELECT u.id, r.id, w.id
FROM sec.users u, sec.roles r, master.warehouses w
WHERE u.username = 'admin' AND r.code = 'sysadmin' AND w.code = 'WH01'
ON CONFLICT DO NOTHING;
