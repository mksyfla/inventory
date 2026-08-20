-- 000008_rbac_admin.up.sql
-- Admin write endpoints (Fase 10.x): create/update users, roles, and a
-- persistent system-settings store. Idempotent: safe to re-run.

-- 1. Extend users with an optional phone field (used by the admin user form).
ALTER TABLE sec.users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

-- 2. Extend roles with an optional description (used by the role matrix form).
ALTER TABLE sec.roles ADD COLUMN IF NOT EXISTS description VARCHAR(255);

-- 3. System settings: single-row-per-key JSONB store (GET/PUT /settings).
CREATE TABLE IF NOT EXISTS sec.settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_by  BIGINT REFERENCES sec.users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Admin write permissions.
INSERT INTO sec.permissions (code) VALUES
    ('user.write'),
    ('role.write'),
    ('settings.read'),
    ('settings.write')
ON CONFLICT (code) DO NOTHING;

-- 5. sysadmin already holds every permission (seed pattern), but re-grant the
-- new codes explicitly so a database that ran the seed earlier picks them up.
INSERT INTO sec.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM sec.roles r, sec.permissions p
WHERE r.code = 'sysadmin'
  AND p.code IN ('user.write','role.write','settings.read','settings.write')
ON CONFLICT DO NOTHING;
