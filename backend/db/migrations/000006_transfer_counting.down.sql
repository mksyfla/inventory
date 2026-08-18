-- 000006_transfer_counting.down.sql
DROP TABLE IF EXISTS doc.transfer_receipts;

ALTER TABLE doc.documents
    DROP COLUMN IF EXISTS manager_approved_by,
    DROP COLUMN IF EXISTS manager_approved_at;

ALTER TABLE inv.stock_movements ALTER COLUMN doc_line_id SET NOT NULL;

-- Index buatan 000006 pada tabel yang tetap ada harus dihapus eksplisit
-- (index doc.transfer_receipts ikut terhapus bersama tabelnya).
DROP INDEX IF EXISTS doc.idx_count_lines_doc;
DROP INDEX IF EXISTS doc.idx_transfer_receipts_doc;
