-- 000012_document_status_audit.up.sql
-- H-12: audit every document status transition inside the same transaction.
--
-- Application code can forget an audit call, or write the audit row after the
-- transaction commits — an audit log that can be lost while the change commits
-- is worse than none. A trigger fires in the SAME transaction as the status
-- UPDATE, so the audit row commits or rolls back with the state change. It also
-- covers every current and future transition (approve, ship, post, receive,
-- count, adjust, transfer, allocate-override) with zero usecase changes.
--
-- Actor attribution: the maker-checker columns on the document row name who
-- moved the status — approved_by for approvals, manager_approved_by for manager
-- approvals, falling back to the creator. ip_address / request_id are left NULL
-- on purpose: they are only known at the HTTP layer, and the app already writes
-- those via its explicit InsertAuditLog path (admin CRUD, receive discrepancy).

CREATE OR REPLACE FUNCTION aud.log_document_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO aud.audit_logs (user_id, action, entity, entity_id, old_value, new_value, ip_address, request_id)
    VALUES (
        COALESCE(NEW.approved_by, NEW.manager_approved_by, NEW.created_by),
        'document.status_change',
        'document',
        NEW.id,
        jsonb_build_object('status', OLD.status::text),
        jsonb_build_object(
            'status',       NEW.status::text,
            'doc_no',       NEW.doc_no,
            'doc_type',     NEW.doc_type::text,
            'warehouse_id', NEW.warehouse_id
        ),
        NULL,
        NULL
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_status_change ON doc.documents;
CREATE TRIGGER trg_document_status_change
AFTER UPDATE OF status ON doc.documents
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION aud.log_document_status_change();
