-- 000008_rbac_admin.down.sql
-- Roll back the admin write endpoints (drop settings store, extra columns and
-- the new permissions). Permission rows are removed last so FK checks hold.

DELETE FROM sec.role_permissions rp
USING sec.permissions p
WHERE rp.permission_id = p.id
  AND p.code IN ('user.write','role.write','settings.read','settings.write');

DELETE FROM sec.permissions
WHERE code IN ('user.write','role.write','settings.read','settings.write');

DROP TABLE IF EXISTS sec.settings;

ALTER TABLE sec.roles DROP COLUMN IF EXISTS description;

ALTER TABLE sec.users DROP COLUMN IF EXISTS phone;
