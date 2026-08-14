-- Fase 6: permission putaway GRN (FSD 5.2, FR-2.5).
-- The FSD endpoint table maps PUTAWAY actions to 'grn.putaway', which the
-- original seed (000002) never defined; roles that received every permission
-- via cross-join at seed time (sysadmin, inventory_manager) must be granted
-- explicitly here.

INSERT INTO sec.permissions (code)
VALUES ('grn.putaway')
ON CONFLICT (code) DO NOTHING;

INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE p.code = 'grn.putaway'
  AND r.code IN ('sysadmin','inventory_manager','warehouse_supervisor','receiving_staff','picker_packer')
ON CONFLICT DO NOTHING;
