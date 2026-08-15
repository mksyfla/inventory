-- 000005_outbound_permissions.up.sql
-- Fase 7 (Outbound M4): permissions for the DO/REQ lifecycle + manual override.
-- The FSD endpoint table maps outbound actions to 'do.*' and the override to
-- 'outbound.override_allocation'. 000002 only seeded do.create/read/approve;
-- the concrete action permissions are granted here, following the 000004
-- pattern (cross-join roles that hold every permission get them explicitly).

INSERT INTO sec.permissions (code)
VALUES ('do.allocate'), ('do.pick'), ('do.ship'), ('do.pod'),
       ('outbound.override_allocation')
ON CONFLICT (code) DO NOTHING;

-- sysadmin & inventory_manager: every outbound permission
INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code IN ('sysadmin','inventory_manager')
  AND p.code IN ('do.allocate','do.pick','do.ship','do.pod','outbound.override_allocation')
ON CONFLICT DO NOTHING;

-- warehouse_supervisor: allocate, ship, pod (+ approve already seeded)
INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'warehouse_supervisor'
  AND p.code IN ('do.allocate','do.ship','do.pod','request.approve')
ON CONFLICT DO NOTHING;

-- picker_packer: picking (view picking list + confirm scans)
INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'picker_packer'
  AND p.code IN ('do.pick')
ON CONFLICT DO NOTHING;

-- courier: record POD on their own deliveries
INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'courier'
  AND p.code IN ('do.pod')
ON CONFLICT DO NOTHING;
