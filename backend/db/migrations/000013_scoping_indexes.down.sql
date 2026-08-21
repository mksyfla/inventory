-- 000013_scoping_indexes.down.sql
DROP INDEX IF EXISTS doc.idx_doc_wh_type_status;
DROP INDEX IF EXISTS doc.idx_doc_partner_id;
DROP INDEX IF EXISTS doc.idx_doc_ref_doc_id;
DROP INDEX IF EXISTS doc.idx_doc_created_by;
DROP INDEX IF EXISTS doc.idx_doc_lines_item_id;
