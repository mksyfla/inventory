# SIMBAR — Sistem Manajemen Inventori

A warehouse inventory management system (WMS) that records and controls every movement of goods from the moment they arrive at the warehouse, through storage at a specific bin, until they are distributed. The core principle: **stock balances are never edited directly** — they are the accumulated result of recorded transactions (perpetual inventory + immutable audit trail), so any discrepancy can always be traced back to a document and its user.

The repo is a full-stack monorepo:

- **`frontend/`** — React 19 + Vite SPA (antd UI, barcode scanning, offline-first drafts)
- **`backend/`** — Go + Echo API (PostgreSQL, Redis, Casbin RBAC, JWT auth, async jobs)
- **`docker-compose.yml`** — one command runs the entire stack, including the new production frontend image

---

## 1. What it does

| Area            | Modules                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| **Dashboard**   | Operational overview, key inventory metrics                                          |
| **Master data** | Items/SKU, warehouses, locations (bin), partners                                     |
| **Inbound**     | GRN / receiving (Goods Receipt Note), putaway                                        |
| **Outbound**    | Requests, deliveries (DO), barcode **picking scan**                                  |
| **Transfer**    | Mutasi antar gudang (incl. _in-transit_ status)                                      |
| **Stock**       | Balances per location–batch, **stock card** (append-only ledger), batch traceability |
| **Counting**    | Stock opname / cycle counting, adjustments                                           |
| **Reports**     | Inventory valuation, FSN analysis, space utilization                                 |
| **Admin**       | Users, roles (**RBAC**), settings, audit logs                                        |

Cross-cutting capabilities: warehouse-scoped RBAC, JWT auth with rotating refresh tokens, barcode/QR scanning (camera or USB scanner), FEFO/FIFO, ABC-based counting, rate limiting, and a fully seeded demo database.

---

## 2. Stack

| Layer    | Technology                                                                           |
| -------- | ------------------------------------------------------------------------------------ |
| Frontend | React 19, Vite 6, TypeScript, Ant Design 5, TanStack Query, Zustand, Dexie (offline) |
| Backend  | Go 1.25, Echo v4, PostgreSQL 16 (pgx + sqlc), Redis 8, Casbin RBAC, asynq            |
| Auth     | JWT (15 min access + 7-day rotating refresh), Argon2id passwords                     |
| Infra    | Docker Compose — Postgres, Redis, migrator, API, worker, nginx frontend              |

---

## 3. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the quick start — everything runs in containers)

Dev-only prerequisites (only needed to run components on bare metal): [Go](https://go.dev/dl/) 1.25+, [Node.js](https://nodejs.org/) 20+.

---

## 4. Quick start — run the whole app with Docker

```bash
docker compose up --build
```

This builds and starts all five services: **db**, **redis**, **migrate** (runs the seed once), **api**, **worker**, and **frontend**. First start takes a few minutes (image builds + DB migrations + demo data seeding).

Then open **<http://localhost:5173>** and log in with a demo account (see [§6](#6-demo-accounts)).

| Service                             | Container            | Host port                                            |
| ----------------------------------- | -------------------- | ---------------------------------------------------- |
| Frontend (nginx SPA + `/api` proxy) | `inventory_frontend` | http://localhost:5173                                |
| Backend API                         | `inventory_api`      | http://localhost:8080                                |
| Swagger UI (API docs)               | —                    | http://localhost:8080/swagger                        |
| PostgreSQL                          | `inventory_postgres` | `localhost:5432` (`user` / `password` / db `dbname`) |
| Redis                               | `inventory_redis`    | `localhost:6379`                                     |

### Useful commands

```bash
docker compose ps                 # service health (all should be "healthy")
docker compose logs -f api        # follow API logs
docker compose logs -f worker     # follow async-job worker logs
docker compose down               # stop everything (data persists in volumes)
docker compose down -v            # stop and wipe the database/redis volumes
```

> The frontend calls the API **same-origin** through nginx (`/api` → `api:8080`), so there is no CORS configuration to worry about. Verify the proxy is up with:
> `curl http://localhost:5173/api/v1/ping` → `{"success":true,"data":"pong","error":null}`

---

## 5. Development mode (hot reload, without Docker)

Backend first — start Postgres + Redis + migrations via Docker, then run the Go API locally:

```bash
docker compose up -d db redis migrate
go run ./cmd/api          # from backend/ → http://localhost:8080
```

Then the frontend dev server (proxies `/api` to the backend):

```bash
npm install               # from frontend/
npm run dev               # → http://localhost:5173
```

Run the async job worker (optional, for background jobs):

```bash
go run ./cmd/worker       # from backend/
```

Tests:

```bash
go test ./... -count=1    # backend
npm test                  # frontend (vitest)
```

---

## 6. Demo accounts

The database ships pre-seeded with realistic data (10 items, 2 warehouses, 12 bins, 18 stock balances, 14 documents, etc.). Log in with any of these:

| Username     | Password        | Role / warehouse scope         |
| ------------ | --------------- | ------------------------------ |
| `admin`      | `Admin@123456`  | sysadmin @ WH01, WH02          |
| `imanager`   | `Simbar@123456` | inventory_manager @ WH01, WH02 |
| `supervisor` | `Simbar@123456` | warehouse_supervisor @ WH01    |
| `receiving`  | `Simbar@123456` | receiving_staff @ WH01         |
| `picker`     | `Simbar@123456` | picker_packer @ WH01           |
| `masterdata` | `Simbar@123456` | master_data_admin @ WH01       |
| `courier`    | `Simbar@123456` | courier @ WH01                 |
| `requester`  | `Simbar@123456` | requester @ WH01               |
| `auditor`    | `Simbar@123456` | auditor @ WH01, WH02           |

> **Change these passwords before any non-dev deployment.** New registrations are automatically given the `requester` role on `WH01`; further roles are assigned by an admin.

---

## 7. How to use the app

1. **Log in** at `http://localhost:5173` (e.g. `admin` / `Admin@123456`).
2. **Pick a warehouse** from the header — every action is scoped to the warehouse you're working in (`WH01` Jakarta, `WH02` Bandung).
3. **Master data first** — ensure items, locations, and partners exist under _Master Data_ before transacting.
4. **Inbound** — create a GRN under _Inbound → Penerimaan (GRN)_, then execute _Putaway_ to move received goods into bins.
5. **Stock** — verify the goods landed correctly under _Stock → Saldo Stok_, and trace any movement on the _Kartu Stok_ (immutable ledger).
6. **Outbound** — submit a _Request_, approve it, and pick the delivery under _Outbound → Picking_ using the barcode scanner.
7. **Transfer** — move stock between warehouses under _Transfer_.
8. **Count & adjust** — run a counting session or post a manual adjustment under _Counting_.
9. **Review** — dashboards, valuation/FSN/space-utilization reports, and the admin _Audit Logs_.

Your access to each module is controlled by RBAC — try logging in as `picker` vs `admin` to see different menus. Barcode input works with a USB wedge scanner or the on-screen camera scanner.

---

## 8. Documentation

- [PRD](PRD-Sistem-Inventori.md) — product requirements (Indonesian)
- [FSD](FSD-Sistem-Inventori.md) — functional specification (Indonesian)
- [sub-task.md](sub-task.md) — build roadmap
- [QA_REPORT.md](QA_REPORT.md) — QA test results
- [vapt.md](vapt.md) — vulnerability assessment & penetration test
- [`backend/README.md`](backend/README.md) — API reference: endpoints, config, auth flow, migrations, logging
- [`frontend/README.md`](frontend/README.md) — frontend architecture, dev config, conventions
- `backend/api/openapi.yaml` — OpenAPI 3.1 contract (also served at `/api/v1/openapi.yaml` and browsable at `/swagger`)

---

## 9. Project layout

```
backend/                  Go API
  cmd/api/                HTTP entrypoint
  cmd/worker/             Async job worker
  cmd/hashpass/           Password hash utility
  internal/               delivery (handlers/middleware), usecase, repository, pkg
  db/migrations/          schema + seed migrations
  db/queries/             sqlc sources
  api/openapi.yaml        OpenAPI 3.1 contract
frontend/                 React SPA
  src/pages/              Route pages grouped by area (master/inbound/outbound/…)
  src/api/                Axios client, services, query client
  src/components/         Reusable UI (guards, camera scanner, modals)
  src/store/              Zustand stores (auth, active warehouse)
  src/routes/             Router + permission guards
  Dockerfile              Multi-stage build → nginx (serves dist + /api proxy)
docker-compose.yml        Full-stack orchestration
```
