-- 000013_scoping_indexes.up.sql
-- M-06: every query in a warehouse-scoped system should lead with
-- warehouse_id, yet doc.documents only had (doc_type, status, doc_date DESC).
-- Add the scoping-leading index plus indexes on every FK that is joined in the
-- read paths (documents.partner_id/ref_doc_id/created_by, document_lines.item_id).
--
-- Non-CONCURRENTLY on purpose: these run at deploy time, not against live
-- traffic, and plain CREATE INDEX is idempotent with IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_doc_wh_type_status
    ON doc.documents (warehouse_id, doc_type, status, doc_date DESC);

CREATE INDEX IF NOT EXISTS idx_doc_partner_id ON doc.documents (partner_id);
CREATE INDEX IF NOT EXISTS idx_doc_ref_doc_id  ON doc.documents (ref_doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_created_by  ON doc.documents (created_by);
CREATE INDEX IF NOT EXISTS idx_doc_lines_item_id ON doc.document_lines (item_id);
