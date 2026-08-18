# Keamanan — SIMBAR

Pemetaan kontrol keamanan terhadap **OWASP Top 10 (2021)** dan acuan FSD §6 / PRD §10.

| # | Risiko OWASP 2021 | Kontrol yang diterapkan | Lokasi |
|---|---|---|---|
| A01 | Broken Access Control | JWT auth wajib di semua rute terproteksi; RBAC Casbin per rute (`sub, dom, obj, act`); header `X-Warehouse-Id` wajib dan **dicek keanggotaannya terhadap klaim `warehouses`** (cegah eskalasi lintas gudang, FR-10.2); kebijakan dimuat dari `sec.role_permissions` × `master.warehouses` saat startup | `internal/delivery/http/middleware/auth.go`, `internal/delivery/http/router.go`, `internal/pkg/auth/rbac.go`, `cmd/api/main.go` |
| A02 | Cryptographic Failures | Password Argon2id (m=64MB, t=3, p=2); JWT HS256 dengan alg di-pin ke HMAC; refresh JTI disimpan sebagai SHA-256 di Redis; `JWT_SECRET` minimal 32 karakter di produksi (error saat startup); kredensial DB tidak lagi dicetak ke stdout; kunci AES partner perlu dipindah ke env (backlog) | `internal/pkg/auth/password.go`, `internal/pkg/auth/jwt.go`, `internal/config/config.go`, `internal/usecase/item/item_usecase.go` |
| A03 | Injection | Seluruh SQL melalui pgx prepared statements (sqlc); tidak ada `os/exec`/`unsafe`; payload job impor di-encode JSON (filename tidak bisa merusak payload) | `internal/repository/postgres/`, `internal/delivery/http/handler/item.go` |
| A04 | Insecure Design | Rate limiting (login 5/15 mnt, register 10/15 mnt, user 100/mnt); keyset pagination; kolom `idempotency_key`; konstrain maker-checker di DB; window rate-limit di-refresh tiap request sehingga tidak ada lockout permanen | `internal/delivery/http/middleware/rate_limit.go`, `internal/pkg/pagination/`, `db/migrations/` |
| A05 | Security Misconfiguration | Security headers lengkap (CSP, HSTS di produksi/TLS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP, `Cache-Control: no-store`); body limit 1 MB (10 MB impor); timeout server HTTP; `ERR_VALIDATION` → 422; pesan error ke klien generik (tanpa kebocoran internal) | `internal/delivery/http/middleware/security_headers.go`, `internal/delivery/http/router.go`, `cmd/api/main.go`, `internal/pkg/apperr/error.go` |
| A06 | Vulnerable Components | Dependensi di-pin di `go.mod`; Swagger UI di-embed (tanpa CDN) | `go.mod`, `internal/delivery/http/openapi.go` |
| A07 | Identification & Auth Failures | Login rate limit per IP; refresh token berotasi + dicabut saat logout; akun nonaktif ditolak saat lookup; kebijakan password minimal 12 karakter (FSD §6) ditegakkan validasi; pesan login generik (tanpa enumerasi) | `internal/delivery/http/middleware/rate_limit.go`, `internal/delivery/http/handler/auth.go`, `internal/delivery/http/dto/auth.go` |
| A08 | Software & Data Integrity | Verifikasi tanda tangan JWT; alg di-pin HMAC; `inv.stock_movements` append-only di level DB (RULE no_update/no_delete) | `internal/pkg/auth/jwt.go`, `db/migrations/000001_init.up.sql` |
| A09 | Logging & Monitoring | `log/slog` terstruktur dengan korelasi `request_id`; error tak terduga di-log server-side, klien hanya menerima pesan generik; health endpoint `/ping`; audit log tabel `aud.audit_logs` tersedia (penulisan event LOGIN masih backlog fase berikutnya) | `internal/pkg/logger/`, `internal/delivery/http/middleware/error_handler.go` |
| A10 | SSRF | Tidak ada fitur fetch URL outbound saat ini — N/A; jika fitur unggah-via-URL ditambahkan, wajib allowlist domain | — |

## Catatan operasional

- **Rate limiter fail-open**: bila Redis down, rate limit dilewati (trade-off ketersediaan vs. brute-force) — pantau Redis.
- **Admin bawaan**: migrasi `000002` membuat pengguna `admin` (password `Admin@123456`) — **wajib diganti setelah login pertama** (`hashpass` tersedia: `go run ./cmd/hashpass -password "<baru>"`).
- **Pengguna demo (migrasi `000003`)**: satu akun per peran PRD §5 — `imanager`, `supervisor`, `receiving`, `picker`, `masterdata`, `courier`, `requester`, `auditor`, semuanya berpassword **`Simbar@123456`** (dev/demo only) — **wajib diganti/ganti password di lingkungan selain dev**. Sebaran gudang: `admin`/`imanager`/`auditor` = WH01+WH02, sisanya WH01 saja.
- **Registrasi otomatis peran `requester` @ `WH01`**: pengguna baru langsung mendapat peran dasar `requester` terikat gudang `WH01` sehingga dapat login dan membuat permintaan; peran/wilayah lain tetap diberikan admin lewat `sec.user_roles`. Kegagalan lookup peran/gudang membatalkan registrasi (transaksional).
- **Kunci AES partner** (`item_usecase.go`) masih hardcoded — backlog: pindahkan ke env/Vault + jalur rotasi.
- **CORS**: tidak diaktifkan (API dikonsumsi same-origin / non-browser).
- **HSTS** hanya aktif di `APP_ENV=production` atau di balik proxy dengan `X-Forwarded-Proto: https`.
