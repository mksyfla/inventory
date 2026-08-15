-- 000006_transfer_counting.up.sql
-- Fase 8 (M5 Mutasi Antar Gudang & M6 Stock Opname):
--   * doc.transfer_receipts        — catatan penerimaan transfer per baris
--                                    (dipakai verifikasi selisih di /receive).
--   * doc.documents.manager_approved_by / _at
--                                  — persetujuan berjenjang opname bernilai
--                                    tinggi (M6.4: Supervisor -> Inventory Manager).

-- 1. Tabel catatan penerimaan transfer (FR-5.1)
CREATE TABLE doc.transfer_receipts (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id   BIGINT NOT NULL REFERENCES doc.documents(id),
    line_id       BIGINT NOT NULL REFERENCES doc.document_lines(id),
    qty_sent      NUMERIC(18,4) NOT NULL CHECK (qty_sent >= 0),
    qty_received  NUMERIC(18,4) NOT NULL CHECK (qty_received >= 0),
    variance      NUMERIC(18,4) GENERATED ALWAYS AS (qty_received - qty_sent) STORED,
    received_by   BIGINT NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes         TEXT,
    UNIQUE (document_id, line_id)
);

-- 2. Persetujuan berjenjang untuk opname bernilai tinggi (M6.4 - M6.5)
ALTER TABLE doc.documents
    ADD COLUMN manager_approved_by BIGINT REFERENCES sec.users(id),
    ADD COLUMN manager_approved_at TIMESTAMPTZ;

-- 3. Ledger boleh mereferensikan dokumen tanpa document_line: penyesuaian
--    manual (ADJ) dan posting opname (CNT) mencatat movement langsung di
--    level balance, bukan dari baris dokumen (FSD M6.4/M6.5).
ALTER TABLE inv.stock_movements ALTER COLUMN doc_line_id DROP NOT NULL;

CREATE INDEX idx_transfer_receipts_doc ON doc.transfer_receipts (document_id);
CREATE INDEX idx_count_lines_doc ON doc.count_lines (document_id);
