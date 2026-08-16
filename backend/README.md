# SIMBAR — Sistem Manajemen Inventori

Warehouse inventory management backend (Go). Perpetual inventory with an append-only stock ledger, warehouse-scoped RBAC, JWT auth with rotating refresh tokens, and a fully seeded demo database.

Spec docs: [PRD](PRD-Sistem-Inventori.md) · [FSD](FSD-Sistem-Inventori.md) · [sub-task roadmap](sub-task.md) · [Security](SECURITY.md)

---

## 1. Stack

| Layer | Technology |
|---|---|
| Language | Go 1.25+ |
| HTTP | Echo v4.15 |
| Database | PostgreSQL 16 (pgx/v5 + sqlc) |
| Cache / rate limit / refresh tokens | Redis 8 |
| Auth | JWT (15 min access + 7-day rotating refresh), Argon2id passwords |
| RBAC | Casbin v2 — model `sub, dom(warehouse), obj, act`, policies loaded from DB |
| Async jobs | hibiken/asynq (Redis) |
| API docs | OpenAPI 3.1 + embedded Swagger UI (no CDN) |

## 2. Prerequisites

- [Go](https://go.dev/dl/) 1.25+
- [Docker](https://www.docker.com/products/docker-desktop/) (for Postgres + Redis)
- [golang-migrate](https://github.com/golang-migrate/migrate) CLI (`go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest`)
- Optional: [sqlc](https://docs.sqlc.dev/) (`go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`) — only needed when editing `db/queries/`

---

## 3. Instantiation (quick start)

### 3.1 Start PostgreSQL + Redis + migrations

```bash
docker compose up -d
```

`docker compose up` automatically runs the pending [golang-migrate](https://github.com/golang-migrate/migrate) migrations in the `migrate` container once Postgres is healthy (it exits with code 0 when done). To apply migrations manually instead, see §3.2.

| Container | Port | Credentials |
|---|---|---|
| `inventory_postgres` | 5432 | `user` / `password` / db `dbname` |
| `inventory_redis` | 6379 | — |
| `inventory_migrate` | — | runs `db/migrations` on startup |

### 3.2 Run migrations (manual / CLI)

Migrations run automatically via Docker, but you can also apply them with the local `migrate` CLI:

```bash
migrate -path db/migrations \
  -database "postgres://user:password@localhost:5432/dbname?sslmode=disable" \
  up
```

| Migration | Contents |
|---|---|
| `000001_init` | Schemas (`master`, `inv`, `doc`, `sec`, `aud`), all tables, enums, ledger append-only rules |
| `000002_seed_rbac` | Warehouse `WH01`, 9 roles, 26 permissions, role→permission mapping, bootstrap admin |
| `000003_seed_data` | Full demo dataset covering every possible value (see §6) |

> If a migration failed mid-run and left the version dirty, fix the SQL then reset with:
> `migrate -path db/migrations -database "postgres://user:password@localhost:5432/dbname?sslmode=disable" force <previous_version>`

### 3.3 Start the API

```bash
go run ./cmd/api
```

Defaults (all overridable — see §4): listens on **`http://localhost:8080`**, DB/Redis from `docker compose`.

Smoke test:

```bash
curl http://localhost:8080/api/v1/ping
# → {"success":true,"data":"pong","error":null}
```

Swagger UI: **<http://localhost:8080/swagger>** — raw spec also at `/api/v1/openapi.yaml` and `/api/v1/openapi.json`.

---

## 4. Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `development` | `development` \| `production` (production requires secure JWT secret; enables HSTS) |
| `PORT` | `8080` | HTTP listen port |
| `DB_CONN_STRING` | `host=localhost user=user password=password dbname=dbname sslmode=disable` | pgx connection string |
| `DB_POOL_MAX` | `10` | Max DB pool connections |
| `REDIS_ADDR` | `localhost:6379` | Redis address |
| `JWT_SECRET` | `super-secret-key` (dev only) | **≥ 32 chars in production** (startup fails otherwise). A warning is logged when the default is used |

Example: `PORT=8081 JWT_SECRET="$(openssl rand -base64 32)" go run ./cmd/api`

---

## 5. Usage

### 5.1 Auth flow

1. **Login** — `POST /api/v1/auth/login` with `{"username","password"}`.
   - Returns `access_token` (15 min) + `refresh_token` (7 days) in the body,
   - **and** sets HttpOnly cookies `access_token` (`Path=/`) + `refresh_token` (`Path=/api/v1/auth`) for browser clients. Cookies are `Secure` when the request is TLS or behind `X-Forwarded-Proto: https`.
2. **Authenticate requests** — send the Bearer header **or** the `access_token` cookie (middleware falls back to the cookie):

   ```
   Authorization: Bearer <access_token>
   X-Warehouse-Id: WH01        ← REQUIRED on every protected request
   ```
3. **Refresh** — `POST /api/v1/auth/refresh` with the refresh token (body or cookie). Rotates the pair, revokes the old one in Redis.
4. **Logout** — `POST /api/v1/auth/logout` revokes the refresh token and clears both cookies.

```bash
# Login and keep cookies for the session
curl -c cookies.txt -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@123456"}'

# Use the cookie jar (no manual token handling)
curl -b cookies.txt http://localhost:8080/api/v1/items \
  -H 'X-Warehouse-Id: WH01'
```

### 5.2 Demo accounts (seeded)

| Username | Password | Roles / warehouse scope |
|---|---|---|
| `admin` | `Admin@123456` | sysadmin @ WH01, WH02 |
| `imanager` | `Simbar@123456` | inventory_manager @ WH01, WH02 |
| `supervisor` | `Simbar@123456` | warehouse_supervisor @ WH01 |
| `receiving` | `Simbar@123456` | receiving_staff @ WH01 |
| `picker` | `Simbar@123456` | picker_packer @ WH01 |
| `masterdata` | `Simbar@123456` | master_data_admin @ WH01 |
| `courier` | `Simbar@123456` | courier @ WH01 |
| `requester` | `Simbar@123456` | requester @ WH01 |
| `auditor` | `Simbar@123456` | auditor @ WH01, WH02 |

**Change these passwords before any non-dev deployment** (`go run ./cmd/hashpass -password "<new>"`, see §7.3). Newly registered users have **no roles** until an admin assigns them via `sec.user_roles`.

### 5.3 Endpoints

Public:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/ping` | Health |
| POST | `/api/v1/auth/login` | Rate limited 5 / 15 min per IP |
| POST | `/api/v1/auth/register` | Rate limited 10 / 15 min per IP; password ≥ 12 chars |
| POST | `/api/v1/auth/refresh` | Rotates refresh token |
| POST | `/api/v1/auth/logout` | Revokes + clears cookies |
| GET | `/api/v1/openapi.yaml` / `.json` | OpenAPI 3.1 spec |
| GET | `/swagger` | Embedded Swagger UI |

Protected (JWT + `X-Warehouse-Id` + RBAC + user rate limit 100/min):

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/items` | `item.read` | Search with `q`, `category_id`, pagination |
| GET | `/api/v1/items/:id` | `item.read` | |
| POST | `/api/v1/items` | `item.write` | Body limit 1 MB |
| PUT | `/api/v1/items/:id` | `item.write` | |
| DELETE | `/api/v1/items/:id` | `item.write` | Soft delete (`is_active=false`) |
| POST | `/api/v1/items/import` | `item.import` | CSV/Excel, async via asynq, body limit 10 MB |
| GET | `/api/v1/locations` | `location.read` | Filter by `warehouse_id` |
| POST | `/api/v1/locations` | `location.write` | |
| GET | `/api/v1/partners` | `partner.read` | |
| GET | `/api/v1/partners/:id` | `partner.read` | |
| POST | `/api/v1/partners` | `partner.write` | |
| GET | `/api/v1/stock/movements` | `stock.read` | Keyset pagination; requires RFC3339 `start_time`/`end_time` |

The `X-Warehouse-Id` value must be a warehouse **code** (`WH01`, `WH02`, …) the user is assigned to — otherwise `403 ERR_FORBIDDEN` (FR-10.2).

### 5.4 Response envelope & errors

```json
{ "success": true,  "data": { }, "meta": { "page_size": 50, "next_cursor": "..." }, "error": null }
{ "success": false, "data": null, "error": { "code": "ERR_VALIDATION", "message": "...",
    "details": [ {"field":"password","message":"must be at least 12 characters long"} ],
    "request_id": "..." } }
```

Validation failures → **422 `ERR_VALIDATION`** with per-field `details`. Other codes: `ERR_UNAUTHENTICATED` (401), `ERR_FORBIDDEN` (403), `ERR_NOT_FOUND` (404), stock/doc conflicts (409), `ERR_INTERNAL` (500, generic message — details only in server logs). See FSD §5.4 for the full table.

### 5.5 Example session

```bash
# 1. Login as inventory manager
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"imanager","password":"Simbar@123456"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['access_token'])")

# 2. List items in WH01
curl -s "http://localhost:8080/api/v1/items?limit=5&q=gandum" \
  -H "Authorization: Bearer $TOKEN" -H 'X-Warehouse-Id: WH01'

# 3. Stock card (movements) for a date range
curl -s "http://localhost:8080/api/v1/stock/movements?start_time=2026-07-01T00:00:00%2B07:00&end_time=2026-09-01T00:00:00%2B07:00" \
  -H "Authorization: Bearer $TOKEN" -H 'X-Warehouse-Id: WH01'

# 4. Warehouse not assigned → 403 (imanager is only in WH01 + WH02)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/v1/items \
  -H "Authorization: Bearer $TOKEN" -H 'X-Warehouse-Id: WH99'   # → 403
```

---

## 6. Seeded demo data (migration `000003`)

The database ships with a coherent, ledger-consistent story (all dates Aug 2026, Asia/Jakarta) covering **every possible value** in the schema:

- **10 items** — every flag combination (plain / batch / batch+expiry / serial) × ABC classes A/B/C, with UoMs + barcodes
- **2 warehouses** (WH01 Jakarta, WH02 Bandung), **12 locations** across all 6 types (staging, pick, bulk, quarantine, damaged, transit)
- **6 partners** — all 3 types (supplier, customer, internal_unit)
- **8 batches** — incl. near-expiry H-90/H-30 and one already-expired
- **18 stock balances** across all 5 statuses (available, quarantine, damaged, expired, in_transit), incl. reserved stock
- **29 stock movements** — all 10 movement types (opening, receipt, putaway, issue, transfer_out/in, adjustment, internal_move, return_in/out), `qty_after` fully reconciled with balances (verified: `SUM(qty)` = `qty_onhand` per key, 0 mismatches)
- **14 documents** — all 9 doc types × all 6 statuses (draft → cancelled), maker–checker respected, with allocations, delivery/POD, count lines, and number sequences continuing from the seeded values
- **Audit trail** samples

---

## 7. Development

### 7.1 Run tests

```bash
go vet ./...
go test ./... -count=1
```

### 7.2 Regenerate queries (sqlc)

Edit `db/queries/init.sql`, then:

```bash
sqlc generate   # regenerates internal/repository/postgres/
```

### 7.3 Password hashing

```bash
go run ./cmd/hashpass -password "MyNewPassword123"
# → $argon2id$v=19$m=65536,t=3,p=2$...
```

### 7.4 Migrations

```bash
# new migration
migrate -path db/migrations -database "postgres://user:password@localhost:5432/dbname?sslmode=disable" create -ext sql -dir db/migrations -seq <name>

# apply / roll back
migrate -path db/migrations -database "postgres://user:password@localhost:5432/dbname?sslmode=disable" up      # or: down 1, force <v>
```

### 7.5 Project layout

```
cmd/api/                 HTTP entrypoint (config, DB pool, Casbin enforcer, server)
cmd/hashpass/            Argon2id hash utility
cmd/worker/              Async job worker (asynq) — placeholder for Fase 9
internal/config/         env loader
internal/delivery/http/  Echo: router, handlers, DTOs, middleware, OpenAPI/Swagger
internal/pkg/            auth (JWT, Argon2id, Casbin builder), validation, pagination, redis, apperr, logger
internal/repository/     postgres (sqlc) + stock repository
internal/usecase/        item, stock usecases
db/migrations/           schema + seed migrations
db/queries/              sqlc sources
api/openapi.yaml         OpenAPI 3.1 contract (embedded via go:embed)
```

---

## 8. Operational notes

- **Rate limits**: login 5 / 15 min per IP, register 10 / 15 min per IP, authenticated 100 / min per user (sliding window — no permanent lockout). Fail-open when Redis is down.
- **Ledger integrity**: `inv.stock_movements` is append-only at the DB level (rules deny UPDATE/DELETE); corrections happen via reversing documents.
- **Security**: OWASP Top 10 controls are mapped in [SECURITY.md](SECURITY.md).
