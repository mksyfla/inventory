-- 000012_document_status_audit.down.sql
DROP TRIGGER IF EXISTS trg_document_status_change ON doc.documents;
DROP FUNCTION IF EXISTS aud.log_document_status_change();
