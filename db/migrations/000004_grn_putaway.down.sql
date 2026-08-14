DELETE FROM sec.role_permissions rp
USING sec.permissions p
WHERE rp.permission_id = p.id AND p.code = 'grn.putaway';

DELETE FROM sec.permissions WHERE code = 'grn.putaway';
