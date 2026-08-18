-- ============ CREATE SCHEMAS ============
CREATE SCHEMA IF NOT EXISTS master;
CREATE SCHEMA IF NOT EXISTS inv;
CREATE SCHEMA IF NOT EXISTS doc;
CREATE SCHEMA IF NOT EXISTS sec;
CREATE SCHEMA IF NOT EXISTS aud;

-- ============ ENABLE EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ CREATE ENUMS & TYPES ============
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_type' AND typnamespace = 'inv'::regnamespace) THEN
        CREATE TYPE inv.location_type AS ENUM ('staging','pick','bulk','quarantine','damaged','transit');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_status' AND typnamespace = 'inv'::regnamespace) THEN
        CREATE TYPE inv.stock_status AS ENUM ('available','quarantine','damaged','expired','in_transit');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type' AND typnamespace = 'inv'::regnamespace) THEN
        CREATE TYPE inv.movement_type AS ENUM ('receipt','issue','transfer_out','transfer_in','adjustment','putaway','internal_move','return_in','return_out','opening');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_type' AND typnamespace = 'doc'::regnamespace) THEN
        CREATE TYPE doc.doc_type AS ENUM ('GRN','DO','TRF','ADJ','RTN_IN','RTN_OUT','CNT','OPN','REQ');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_status' AND typnamespace = 'doc'::regnamespace) THEN
        CREATE TYPE doc.doc_status AS ENUM ('draft','submitted','approved','in_progress','completed','cancelled');
    END IF;
END
$$;

-- ============ CREATE TABLES ============

-- 1. master.categories
CREATE TABLE IF NOT EXISTS master.categories (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. master.items
CREATE TABLE IF NOT EXISTS master.items (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    sku           VARCHAR(50)  NOT NULL UNIQUE,
    name          VARCHAR(255) NOT NULL,
    category_id   BIGINT REFERENCES master.categories(id),
    base_uom      VARCHAR(20)  NOT NULL,
    is_batch      BOOLEAN NOT NULL DEFAULT FALSE,
    is_expiry     BOOLEAN NOT NULL DEFAULT FALSE,
    is_serial     BOOLEAN NOT NULL DEFAULT FALSE,
    min_qty       NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
    max_qty       NUMERIC(18,4),
    safety_stock  NUMERIC(18,4) NOT NULL DEFAULT 0,
    lead_time_days SMALLINT NOT NULL DEFAULT 0,
    abc_class     CHAR(1) CHECK (abc_class IN ('A','B','C')),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    BIGINT NOT NULL,
    updated_at    TIMESTAMPTZ,
    updated_by    BIGINT,
    CONSTRAINT chk_expiry_needs_batch CHECK (NOT is_expiry OR is_batch),
    CONSTRAINT chk_max_gte_min CHECK (max_qty IS NULL OR max_qty >= min_qty)
);
CREATE INDEX idx_items_name_trgm ON master.items USING gin (name gin_trgm_ops);

-- 3. master.item_uoms
CREATE TABLE IF NOT EXISTS master.item_uoms (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id       BIGINT NOT NULL REFERENCES master.items(id),
    uom           VARCHAR(20) NOT NULL,
    conv_factor   NUMERIC(18,6) NOT NULL CHECK (conv_factor > 0),
    barcode       VARCHAR(64),
    UNIQUE (item_id, uom),
    UNIQUE (barcode)
);

-- 4. master.warehouses
CREATE TABLE IF NOT EXISTS master.warehouses (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code      VARCHAR(20) NOT NULL UNIQUE,
    name      VARCHAR(150) NOT NULL,
    address   TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. master.locations
CREATE TABLE IF NOT EXISTS master.locations (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id BIGINT NOT NULL REFERENCES master.warehouses(id),
    code         VARCHAR(30) NOT NULL,
    zone         VARCHAR(20),
    rack         VARCHAR(20),
    level        VARCHAR(20),
    loc_type     inv.location_type NOT NULL DEFAULT 'bulk',
    pick_seq     INTEGER,
    capacity     NUMERIC(18,4),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (warehouse_id, code)
);

-- 6. master.batches
CREATE TABLE IF NOT EXISTS master.batches (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id     BIGINT NOT NULL REFERENCES master.items(id),
    batch_no    VARCHAR(60) NOT NULL,
    mfg_date    DATE,
    expiry_date DATE,
    UNIQUE (item_id, batch_no)
);
CREATE INDEX idx_batches_expiry ON master.batches (item_id, expiry_date);

-- 7. master.partners
CREATE TABLE IF NOT EXISTS master.partners (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code         VARCHAR(30) NOT NULL UNIQUE,
    partner_type VARCHAR(20) NOT NULL CHECK (partner_type IN ('supplier','customer','internal_unit')),
    name         VARCHAR(200) NOT NULL,
    address      TEXT,
    contact_name VARCHAR(100),
    contact_phone VARCHAR(30),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- 8. inv.stock_balances
CREATE TABLE IF NOT EXISTS inv.stock_balances (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id      BIGINT NOT NULL REFERENCES master.items(id),
    location_id  BIGINT NOT NULL REFERENCES master.locations(id),
    batch_id     BIGINT REFERENCES master.batches(id),
    status       inv.stock_status NOT NULL DEFAULT 'available',
    qty_onhand   NUMERIC(18,4) NOT NULL DEFAULT 0,
    qty_reserved NUMERIC(18,4) NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_onhand_nonneg   CHECK (qty_onhand >= 0),
    CONSTRAINT chk_reserved_valid  CHECK (qty_reserved >= 0 AND qty_reserved <= qty_onhand)
);
CREATE UNIQUE INDEX uq_balance_key ON inv.stock_balances (item_id, location_id, COALESCE(batch_id, 0), status);
CREATE INDEX idx_balance_item_status ON inv.stock_balances (item_id, status) WHERE qty_onhand > 0;

-- 9. doc.documents
CREATE TABLE IF NOT EXISTS doc.documents (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id      UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    doc_no         VARCHAR(40) NOT NULL UNIQUE,
    doc_type       doc.doc_type NOT NULL,
    doc_date       DATE NOT NULL,
    status         doc.doc_status NOT NULL DEFAULT 'draft',
    warehouse_id   BIGINT NOT NULL REFERENCES master.warehouses(id),
    dest_warehouse_id BIGINT REFERENCES master.warehouses(id),
    partner_id     BIGINT REFERENCES master.partners(id),
    ref_doc_id     BIGINT REFERENCES doc.documents(id),
    reason_code    VARCHAR(30),
    notes          TEXT,
    idempotency_key VARCHAR(80) UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     BIGINT NOT NULL,
    submitted_at   TIMESTAMPTZ,
    approved_at    TIMESTAMPTZ,
    approved_by    BIGINT,
    completed_at   TIMESTAMPTZ,
    CONSTRAINT chk_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by)
);
CREATE INDEX idx_doc_type_status ON doc.documents (doc_type, status, doc_date DESC);

-- 10. doc.document_lines
CREATE TABLE IF NOT EXISTS doc.document_lines (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id   BIGINT NOT NULL REFERENCES doc.documents(id) ON DELETE CASCADE,
    line_no       SMALLINT NOT NULL,
    item_id       BIGINT NOT NULL REFERENCES master.items(id),
    uom           VARCHAR(20) NOT NULL,
    conv_factor   NUMERIC(18,6) NOT NULL,
    qty_request   NUMERIC(18,4) NOT NULL CHECK (qty_request > 0),
    qty_processed NUMERIC(18,4) NOT NULL DEFAULT 0,
    batch_id      BIGINT REFERENCES master.batches(id),
    location_id   BIGINT REFERENCES master.locations(id),
    status        inv.stock_status NOT NULL DEFAULT 'available',
    notes         TEXT,
    UNIQUE (document_id, line_no)
);

-- 11. inv.stock_movements
CREATE TABLE IF NOT EXISTS inv.stock_movements (
    id            BIGINT GENERATED ALWAYS AS IDENTITY,
    moved_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_id       BIGINT NOT NULL REFERENCES master.items(id),
    location_id   BIGINT NOT NULL REFERENCES master.locations(id),
    batch_id      BIGINT REFERENCES master.batches(id),
    status        inv.stock_status NOT NULL,
    movement_type inv.movement_type NOT NULL,
    qty           NUMERIC(18,4) NOT NULL CHECK (qty <> 0),
    qty_after     NUMERIC(18,4) NOT NULL,
    unit_cost     NUMERIC(18,4),
    doc_line_id   BIGINT NOT NULL REFERENCES doc.document_lines(id),
    doc_no        VARCHAR(40) NOT NULL,
    created_by    BIGINT NOT NULL,
    PRIMARY KEY (id, moved_at)
) PARTITION BY RANGE (moved_at);
CREATE INDEX idx_mov_item_time ON inv.stock_movements (item_id, moved_at DESC);
CREATE INDEX idx_mov_doc ON inv.stock_movements (doc_line_id);

-- Enforce partitioned table default partition to handle insertions cleanly
CREATE TABLE IF NOT EXISTS inv.stock_movements_default PARTITION OF inv.stock_movements DEFAULT;

-- Enforce append-only rules
CREATE RULE no_update_movements AS ON UPDATE TO inv.stock_movements DO INSTEAD NOTHING;
CREATE RULE no_delete_movements AS ON DELETE TO inv.stock_movements DO INSTEAD NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        REVOKE UPDATE, DELETE ON inv.stock_movements FROM app_user;
    END IF;
END
$$;

-- 12. doc.allocations
CREATE TABLE IF NOT EXISTS doc.allocations (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doc_line_id   BIGINT NOT NULL REFERENCES doc.document_lines(id) ON DELETE CASCADE,
    balance_id    BIGINT NOT NULL REFERENCES inv.stock_balances(id),
    qty_allocated NUMERIC(18,4) NOT NULL CHECK (qty_allocated > 0),
    qty_picked    NUMERIC(18,4) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. doc.document_numbers
CREATE TABLE IF NOT EXISTS doc.document_numbers (
    doc_type   doc.doc_type NOT NULL,
    period     CHAR(6) NOT NULL,
    last_seq   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (doc_type, period)
);

-- 14. doc.deliveries
CREATE TABLE IF NOT EXISTS doc.deliveries (
    document_id     BIGINT PRIMARY KEY REFERENCES doc.documents(id),
    vehicle_no      VARCHAR(20),
    driver_name     VARCHAR(100),
    shipped_at      TIMESTAMPTZ,
    received_by     VARCHAR(100),
    received_at     TIMESTAMPTZ,
    pod_file_url    TEXT,
    signature_url   TEXT
);

-- 15. doc.count_lines
CREATE TABLE IF NOT EXISTS doc.count_lines (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id   BIGINT NOT NULL REFERENCES doc.documents(id),
    item_id       BIGINT NOT NULL REFERENCES master.items(id),
    location_id   BIGINT NOT NULL REFERENCES master.locations(id),
    batch_id      BIGINT REFERENCES master.batches(id),
    qty_system    NUMERIC(18,4) NOT NULL,
    qty_counted   NUMERIC(18,4),
    variance      NUMERIC(18,4) GENERATED ALWAYS AS (qty_counted - qty_system) STORED,
    reason_code   VARCHAR(30),
    counted_by    BIGINT,
    counted_at    TIMESTAMPTZ
);

-- 16. sec.users
CREATE TABLE IF NOT EXISTS sec.users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,
    email         VARCHAR(150) UNIQUE,
    full_name     VARCHAR(150) NOT NULL,
    password_hash TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_secret    TEXT,
    last_login_at TIMESTAMPTZ
);

-- 17. sec.roles
CREATE TABLE IF NOT EXISTS sec.roles (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          VARCHAR(40) UNIQUE,
    name          VARCHAR(100)
);

-- 18. sec.permissions
CREATE TABLE IF NOT EXISTS sec.permissions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          VARCHAR(60) UNIQUE
);

-- 19. sec.role_permissions
CREATE TABLE IF NOT EXISTS sec.role_permissions (
    role_id       BIGINT REFERENCES sec.roles(id) ON DELETE CASCADE,
    permission_id BIGINT REFERENCES sec.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 20. sec.user_roles
CREATE TABLE IF NOT EXISTS sec.user_roles (
    user_id       BIGINT REFERENCES sec.users(id) ON DELETE CASCADE,
    role_id       BIGINT REFERENCES sec.roles(id) ON DELETE CASCADE,
    warehouse_id  BIGINT REFERENCES master.warehouses(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id, warehouse_id)
);

-- 21. aud.audit_logs
CREATE TABLE IF NOT EXISTS aud.audit_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id     BIGINT,
    action      VARCHAR(60) NOT NULL,
    entity      VARCHAR(60) NOT NULL,
    entity_id   BIGINT,
    old_value   JSONB,
    new_value   JSONB,
    ip_address  INET,
    request_id  UUID
);
CREATE INDEX idx_audit_entity ON aud.audit_logs (entity, entity_id, occurred_at DESC);
