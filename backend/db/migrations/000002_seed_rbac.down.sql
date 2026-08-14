-- 000002_seed_rbac.down.sql
-- Removes only the seeded RBAC data. Rows modified by the application are kept.

DELETE FROM sec.user_roles
WHERE user_id IN (SELECT id FROM sec.users WHERE username = 'admin');

DELETE FROM sec.users WHERE username = 'admin';

DELETE FROM sec.role_permissions
WHERE role_id IN (SELECT id FROM sec.roles WHERE code IN (
    'sysadmin','inventory_manager','warehouse_supervisor','receiving_staff',
    'picker_packer','master_data_admin','courier','requester','auditor'
));

DELETE FROM sec.permissions WHERE code IN (
    'item.read','item.write','item.import',
    'location.read','location.write',
    'partner.read','partner.write',
    'stock.read',
    'grn.create','grn.read','grn.approve',
    'do.create','do.read','do.approve',
    'transfer.create','transfer.read','transfer.approve',
    'request.create','request.read','request.approve',
    'count.create','count.execute','count.approve',
    'adj.create','adj.read','adj.approve',
    'report.read','dashboard.read','audit.read'
);

DELETE FROM sec.roles WHERE code IN (
    'sysadmin','inventory_manager','warehouse_supervisor','receiving_staff',
    'picker_packer','master_data_admin','courier','requester','auditor'
);

DELETE FROM master.warehouses WHERE code = 'WH01';
