-- 000009_grn_attachments.up.sql
-- GRN attachments (lampiran GRN): metadata rows bound to a document
-- (doc_type GRN) used by the receipt attachment tab. The file bytes are not
-- stored — the row persists the reference (file_url), category and uploader
-- metadata so the receipt detail page lists them from the database.

-- 1. Attachment rows. Category is a VARCHAR with a CHECK so new categories are
--    a data migration rather than a DDL.
CREATE TABLE IF NOT EXISTS doc.attachments (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id     BIGINT NOT NULL REFERENCES doc.documents(id) ON DELETE CASCADE,
    category        VARCHAR(32) NOT NULL DEFAULT 'other',
    file_name       TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    file_url        TEXT NOT NULL,
    uploaded_by     BIGINT NOT NULL REFERENCES sec.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_attachment_category
        CHECK (category IN ('delivery_note','qc_inspection','truck_photo','other'))
);

CREATE INDEX idx_attachments_document ON doc.attachments (document_id, created_at DESC);
