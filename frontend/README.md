# SIMBAR — Frontend Web

Warehouse inventory management SPA (React). Dashboards, master data, and inbound (GRN / putaway) workflows backed by the SIMBAR Go API, with RBAC-driven routing, barcode scanning, and offline-first drafts.

Spec docs: [PRD](PRD-Sistem-Inventori.md) · [FSD](FSD-Sistem-Inventori.md) · [sub-task roadmap](subtask.md)

---

## 1. Stack

| Layer         | Technology                                                         |
| ------------- | ------------------------------------------------------------------ |
| Language      | TypeScript (strict)                                                |
| Framework     | React 19 + Vite 6                                                  |
| UI            | Ant Design 5 (`antd`) + lucide-react icons                         |
| Data fetching | TanStack React Query 5 + Axios                                     |
| Forms         | react-hook-form + Zod (schema validation)                          |
| State         | Zustand (auth, active warehouse)                                   |
| Routing       | react-router-dom 7                                                 |
| Barcode       | @zxing/browser + @zxing/library (camera scan), keyboard-wedge hook |
| Offline       | Dexie (IndexedDB) drafts + sync queue                              |
| Tests         | Vitest + Testing Library + jsdom                                   |

---

## 2. Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm
- The SIMBAR backend running locally (see [`../backend/README.md`](../backend/README.md)) — Postgres + Redis via `docker compose`, API on `http://localhost:8080`

---

## 3. Instantiation (quick start)

```bash
npm install
npm run dev
```

Vite dev server starts at **`http://localhost:5173`** and proxies `/api` and `/swagger` to the backend (see §4 for the base URL).

### 3.1 Production build

```bash
npm run build      # tsc -b && vite build  → dist/
npm run preview    # serve the production bundle locally
```

### 3.2 Run tests

```bash
npm test           # vitest run (single pass)
npm run test:watch # watch mode
```

---

## 4. Configuration (environment variables)

Create `.env.local` in `frontend/` to override defaults:

| Variable            | Default   | Description                                                                      |
| ------------------- | --------- | -------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `/api/v1` | Backend API base path (proxied in dev; set to full URL when deployed separately) |

When using the Vite dev proxy the backend serves `/api/v1` and `/swagger` on `http://localhost:8080`, so no config is needed locally.

---

## 5. Architecture

### 5.1 Request pipeline (`src/api/client.ts`)

A single Axios instance (`apiClient`) enriches every request and normalizes every error:

- **Request interceptor** adds `Authorization: Bearer <token>`, `X-Request-Id` (UUID), `X-Warehouse-Id` (active warehouse), and an `Idempotency-Key` for POST/PUT/PATCH/DELETE.
- **Response interceptor** unwraps the `{ success, data, error }` envelope, shows standardized Indonesian error notifications, and transparently retries once via `/auth/refresh` on a 401 before forcing logout and redirecting to `/login`.

### 5.2 Routing & permissions (`src/routes/router.tsx`)

Routes are guarded by two components:

- `ProtectedRoute` — blocks unauthenticated access.
- `PermissionGuard` — renders children only if `useAuthStore.hasPermission(...)` passes (e.g. `item.write`, `grn.putaway`); otherwise shows `ForbiddenPage`.

### 5.3 Offline-first drafts (`src/db/offlineDb.ts`)

Dexie (IndexedDB) `simbar_offline_db` stores draft receipts, pickings, stock counts, and a `syncQueue` (keyed by idempotency key) so field work continues without connectivity and replays once online.

### 5.4 Project layout

```
src/api/        Axios client, error mapper, query client, response types
src/components/ Reusable UI: layout bars, guards, modals (camera scanner, barcode print, import)
src/db/         Dexie offline database
src/hooks/      Shared hooks: pagination, debounce, mutations with toast, offline drafts, scanner wedge
src/layouts/    Authenticated app shell (sidebar + header + breadcrumb)
src/pages/      Route pages: dashboard, master (items/warehouses/locations/partners), inbound (GRN/putaway)
src/routes/     Router + guards
src/store/      Zustand stores: auth, active warehouse
src/types/      Domain types per entity (item, warehouse, user, inbound, …)
src/utils/      Theme, audio feedback, UUID
src/__tests__/  Vitest + Testing Library tests
```

---

## 6. Demo credentials

The seeded backend users work out of the box (see [`../backend/README.md`](../backend/README.md) §5.2). The frontend also ships with a mock authed user for UI development (`src/store/useAuthStore.ts`).

| Username    | Password        |
| ----------- | --------------- |
| `admin`     | `Admin@123456`  |
| `imanager`  | `Simbar@123456` |
| `receiving` | `Simbar@123456` |

---

## 7. Development notes

- **Adding a page**: create it under `src/pages/<area>/`, wrap it in a `PermissionGuard` with the required permission, and register it in `src/routes/router.tsx`.
- **Forms**: define a Zod schema (tested in `src/__tests__/*Schema.test.ts`), pass it to `useForm` with `zodResolver`, and submit through `useMutationWithToast` + `usePaginatedQuery` for lists.
- **Barcode input**: `useScannerKeyboardWedge` accepts physical-scanner key events; `CameraScannerModal` scans via the device camera (`@zxing`).
- **Types**: keep domain types in `src/types/` per entity and reuse them across API responses and store state.
