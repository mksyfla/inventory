-- 000005_outbound_permissions.down.sql
DELETE FROM sec.role_permissions
WHERE permission_id IN (SELECT id FROM sec.permissions
    WHERE code IN ('do.allocate','do.pick','do.ship','do.pod','outbound.override_allocation'));

DELETE FROM sec.permissions
WHERE code IN ('do.allocate','do.pick','do.ship','do.pod','outbound.override_allocation');
