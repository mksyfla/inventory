ALTER TABLE aud.audit_logs
ALTER COLUMN request_id SET DEFAULT gen_random_uuid();
