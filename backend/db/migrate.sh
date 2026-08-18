#!/bin/sh
# SIMBAR database migrator (idempotent, one-shot service di docker-compose).
#
# Menunggu Postgres siap, lalu menerapkan db/migrations/*.up.sql secara
# berurutan. Setiap versi dicatat di tabel `simbar_migrations` (public).
# Jika migrasi sudah pernah diterapkan (marker ada ATAU objek khasnya sudah
# ada di DB — mis. volume lama dari sebelum ada layanan migrate), versi itu
# dilewati. Aman dijalankan ulang berkali-kali.
set -o errexit

echo "[migrate] waiting for postgres..."
until pg_isready -h "${PGHOST:-db}" -U "${PGUSER:-user}" -d "${PGDATABASE:-dbname}"; do
    sleep 1
done

psql -v ON_ERROR_STOP=1 -c "
CREATE TABLE IF NOT EXISTS simbar_migrations (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);" >/dev/null

# canary_for: objek khas yang dibuat/diisi oleh migrasi — dipakai untuk
# mendeteksi migrasi yang sudah terlanjur diterapkan (mis. via psql manual).
canary_for() {
    case "$1" in
        000001*) echo "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'master' AND c.relname = 'categories' LIMIT 1" ;;
        000002*) echo "SELECT 1 FROM sec.roles WHERE code = 'sysadmin' LIMIT 1" ;;
        000003*) echo "SELECT 1 FROM master.items WHERE sku = 'SKU-001' LIMIT 1" ;;
        000004*) echo "SELECT 1 FROM sec.permissions WHERE code = 'grn.putaway' LIMIT 1" ;;
        000005*) echo "SELECT 1 FROM sec.permissions WHERE code = 'outbound.override_allocation' LIMIT 1" ;;
        000006*) echo "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'doc' AND c.relname = 'transfer_receipts' LIMIT 1" ;;
        000007*) echo "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'inv' AND c.relname = 'replenishment_suggestions' LIMIT 1" ;;
        *) echo "SELECT 0" ;;
    esac
}

for f in /migrations/*.up.sql; do
    version=$(basename "$f" .up.sql)

    if [ "$(psql -tAc "SELECT 1 FROM simbar_migrations WHERE version = '$version'")" = "1" ]; then
        echo "[migrate] skip $version (sudah tercatat)"
        continue
    fi

    if [ "$(psql -tAc "$(canary_for "$version")")" = "1" ]; then
        echo "[migrate] tandai $version (objek sudah ada di DB)"
        psql -tAc "INSERT INTO simbar_migrations (version) VALUES ('$version')" >/dev/null
        continue
    fi

    echo "[migrate] terapkan $version ..."
    psql -v ON_ERROR_STOP=1 -f "$f"
    psql -tAc "INSERT INTO simbar_migrations (version) VALUES ('$version')" >/dev/null
done

echo "[migrate] selesai"
