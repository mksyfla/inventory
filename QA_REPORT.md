# QA Report

## 1. Test Information

- **Branch**: `kasyfil-integrations`
- **Date**: 2026-08-19
- **Environment**: Local Windows 11 x64, Node.js v22.12.0, Go 1.25.2, PostgreSQL 16 (Docker), Redis 8 (Docker), Vite Dev Server (port :5173), Go Backend API (port :8080)
- **Testing Scope**:
    - **Automated Tests**: Frontend Vitest suites (`npm test`) and Go backend test suites (`go test ./...`)
    - **Application Startup & Infrastructure**: Container health probes (`/healthz`, `/readyz`), service connectivity, and reverse-proxy routing
    - **Live API & Functional Integration**: End-to-end user workflows across Auth, RBAC, Master Data, Inbound (GRN), Outbound (Requests & Deliveries), Transfers, Stock Opname, Reports, and Administration
    - **Input Validation Testing**: Required fields validation, data type and schema enforcement, numeric boundary and constraint testing, string format/length rules, enum/status validation, and date/time format validation
    - **Frontend vs Backend Validation**: Testing direct API calls with invalid payloads bypassing client-side validation to verify independent backend enforcement
    - **API Error Handling**: Status code verification (HTTP 400/401/403/404/409/422 vs 500) and structured error response payloads (`code`, `message`, `details`, `request_id`)
    - **Security & RBAC Enforcement**: Role-based access control validation across 9 user roles

## 2. Application Overview

**SIMBAR (Sistem Informasi Manajemen Barang / Inventory Management System)** is an enterprise inventory management web application. The frontend is built with React 19, TypeScript, Ant Design, and Vite. The backend is built with Go (Echo framework), PostgreSQL 16, and Redis for caching and rate limiting.

Major tested functionality includes:

- **Authentication & Security**: JWT-based access/refresh token lifecycle, sliding-window rate limiting, and request ID tracking.
- **RBAC (Role-Based Access Control)**: Enforcing granular resource/action permissions for 9 user roles (sysadmin, inventory_manager, warehouse_supervisor, receiving_staff, picker_packer, master_data_admin, courier, requester, auditor).
- **Master Data**: Management of items (SKU, UoM conversions, batch/expiry flags), warehouses, storage locations/bins, and partners.
- **Inbound Operations (GRN)**: Goods receipt draft creation, maker-checker approval workflows, putaway suggestions, bin putaway execution, and receipt document attachment metadata management.
- **Outbound Operations**: Material request creation, delivery order (DO) generation, FIFO/FEFO inventory allocation, picking lists, barcode-verified picking scans, courier dispatch, and Proof of Delivery (POD).
- **Transfers & Relocation**: Inter-warehouse stock transfers with in-transit tracking and multi-step receiving.
- **Stock Opname & Counting**: Cycle count session creation, blind counting input, posting variances, and manual stock adjustments.
- **Reports & Analytics**: FSN (Fast, Slow, Non-moving) classification, Inventory Valuation, Space Utilization occupancy rates, and Dashboard KPI summaries.
- **Administration**: User provisioning, role assignments, system configuration settings, and audit log inspection.

## 3. Test Summary

- **Total Test Cases**: 114
- **Passed**: 109
- **Failed**: 3 (initial run — all 3 re-verified as **PASS** after fixes; see §9)
- **Blocked**: 2 (`BLK-01` Playwright CDN download, `BLK-02` migration — `BLK-02` unblocked by the BUG-03 fix; `docker compose up` now applies all migrations cleanly)
- **Security (this run)**: 1 CRITICAL / 2 HIGH / 1 MEDIUM / 2 LOW findings — see §10.

---

## 4. Functional & Integration Test Cases

| ID             | Area               | Scenario                                                                  | Expected Result                                         | Actual Result                                                                           | Status      | Severity |
| -------------- | ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- | -------- |
| **AUTO-FE**    | Automated Tests    | Run frontend test suite (68 test files / 152 tests)                       | All component and integration tests pass                | 152/152 tests passed in 662s                                                            | **PASS**    | None     |
| **AUTO-BE**    | Automated Tests    | Run backend test suite (`go test ./...`)                                  | All unit and integration test packages pass             | All packages passed (including postgres integration tests)                              | **PASS**    | None     |
| **TC-01**      | System Health      | Backend health liveness probe (`GET /healthz`)                            | HTTP 200 `{"status":"ok"}`                              | HTTP 200 `{"status":"ok"}`                                                              | **PASS**    | None     |
| **TC-02**      | Auth               | Login with invalid password                                               | HTTP 401 Unauthorized with `ERR_UNAUTHENTICATED`        | HTTP 401 `ERR_UNAUTHENTICATED` returned                                                 | **PASS**    | None     |
| **TC-03**      | Auth               | Login with valid admin credentials                                        | HTTP 200 OK with JWT `access_token` and `refresh_token` | HTTP 200 OK with valid JWT tokens                                                       | **PASS**    | None     |
| **TC-04**      | Auth               | Token refresh (`POST /api/v1/auth/refresh`)                               | HTTP 200 OK with newly issued `access_token`            | HTTP 200 OK with refreshed access token                                                 | **PASS**    | None     |
| **TC-05**      | Master Data        | List items (`GET /api/v1/items`)                                          | HTTP 200 with array of item objects                     | HTTP 200, returned 11 items                                                             | **PASS**    | None     |
| **TC-06**      | Master Data        | Get item detail (`GET /api/v1/items/:id`)                                 | HTTP 200 with item data and UoM conversions             | HTTP 200, returned item details and 2 UoMs                                              | **PASS**    | None     |
| **TC-07**      | Master Data        | List warehouses (`GET /api/v1/warehouses`)                                | HTTP 200 with warehouse list (`WH01`, `WH02`)           | HTTP 200, returned 2 active warehouses                                                  | **PASS**    | None     |
| **TC-08**      | Master Data        | List locations (`GET /api/v1/locations?warehouse_id=1`)                   | HTTP 200 with location bins for warehouse               | HTTP 200, returned 8 location bins                                                      | **PASS**    | None     |
| **TC-09**      | Master Data        | List partners (`GET /api/v1/partners`)                                    | HTTP 200 with suppliers and customers                   | HTTP 200, returned 6 partner records                                                    | **PASS**    | None     |
| **TC-10**      | Master Data        | List categories (`GET /api/v1/categories`)                                | HTTP 200 with item categories                           | HTTP 200, returned 6 categories                                                         | **PASS**    | None     |
| **TC-11**      | Master Data        | Create new item (`POST /api/v1/items`)                                    | HTTP 201 Created with generated item ID                 | HTTP 201 Created, ID returned                                                           | **PASS**    | None     |
| **TC-12**      | Master Data        | Update existing item (`PATCH /api/v1/items/:id`)                          | HTTP 200 OK with updated item attributes                | HTTP 200 OK, updated attributes reflected                                               | **PASS**    | None     |
| **TC-13**      | Inbound            | List GRN documents (`GET /api/v1/documents?type=GRN`)                     | HTTP 200 with GRN documents                             | HTTP 200 with GRN document list                                                         | **PASS**    | None     |
| **TC-14**      | Inbound            | Get GRN detail (`GET /api/v1/documents/:id`)                              | HTTP 200 with header, lines, and partners               | HTTP 200 with complete GRN lines and partner info                                       | **PASS**    | None     |
| **TC-15**      | Inbound            | Create GRN document (`POST /api/v1/receipts`)                             | HTTP 201 Created with doc ID and number                 | HTTP 201 Created (`GRN/WH01/2608/00021`)                                                | **PASS**    | None     |
| **TC-16**      | Inbound            | Submit GRN draft (`POST /api/v1/receipts/:id/submit`)                     | HTTP 200 OK with status `submitted`                     | HTTP 200 OK, status `submitted`                                                         | **PASS**    | None     |
| **TC-17**      | Inbound            | Approve GRN (`POST /api/v1/receipts/:id/approve`)                         | HTTP 200 OK with status `approved`                      | HTTP 200 OK, status `approved`                                                          | **PASS**    | None     |
| **TC-18**      | Inbound            | Get putaway suggestions (`GET /api/v1/receipts/:id/putaway-suggestion`)   | HTTP 200 with candidate bin locations                   | HTTP 200 with ranked locations (`PK-01-01`, etc.)                                       | **PASS**    | None     |
| **TC-19**      | Inbound            | Execute putaway (`POST /api/v1/receipts/:id/putaway`)                     | HTTP 200 OK with status `completed`                     | HTTP 200 OK, status `completed`                                                         | **PASS**    | None     |
| **TC-20**      | Inbound            | Add GRN attachment (`POST /api/v1/receipts/:id/attachments`)              | HTTP 201 Created with attachment ID                     | HTTP 201 Created, ID 1                                                                  | **PASS**    | None     |
| **TC-21**      | Inbound            | List GRN attachments (`GET /api/v1/receipts/:id/attachments`)             | HTTP 200 with list of document attachments              | HTTP 200 with 1 attachment entry                                                        | **PASS**    | None     |
| **TC-22**      | Inbound            | Delete GRN attachment (`DELETE /api/v1/receipts/:id/attachments/:att_id`) | HTTP 200 OK with `{"deleted": true}`                    | HTTP 200 OK with `{"deleted": true}`                                                    | **PASS**    | None     |
| **TC-23**      | Outbound           | List requests (`GET /api/v1/documents?type=REQ`)                          | HTTP 200 with outbound requests                         | HTTP 200 with request list                                                              | **PASS**    | None     |
| **TC-24**      | Outbound           | Create outbound request (`POST /api/v1/requests`)                         | HTTP 201 Created with doc ID and number                 | HTTP 201 Created (`REQ/WH01/2608/00021`)                                                | **PASS**    | None     |
| **TC-25**      | Outbound           | Submit request draft (`POST /api/v1/requests/:id/submit`)                 | HTTP 200 OK with status `submitted`                     | HTTP 200 OK, status `submitted`                                                         | **PASS**    | None     |
| **TC-26**      | Outbound           | Approve request (`POST /api/v1/requests/:id/approve`)                     | HTTP 200 OK with status `approved`                      | HTTP 200 OK, status `approved`                                                          | **PASS**    | None     |
| **TC-27**      | Outbound           | List deliveries (`GET /api/v1/documents?type=DO`)                         | HTTP 200 with delivery orders                           | HTTP 200 with delivery orders list                                                      | **PASS**    | None     |
| **TC-28**      | Outbound           | Create delivery order (`POST /api/v1/deliveries`)                         | HTTP 201 Created with doc ID and number                 | HTTP 201 Created (`DO/WH01/2608/00021`)                                                 | **PASS**    | None     |
| **TC-29**      | Outbound           | Submit & Approve DO                                                       | HTTP 200 OK status transitions                          | HTTP 200 OK, `submitted` -> `approved`                                                  | **PASS**    | None     |
| **TC-30**      | Outbound           | Allocate stock for DO (`POST /api/v1/deliveries/:id/allocate`)            | HTTP 200 OK with allocated balance lots                 | HTTP 200 OK, 1 allocation generated                                                     | **PASS**    | None     |
| **TC-31**      | Outbound           | Get picking list (`GET /api/v1/deliveries/:id/picking-list`)              | HTTP 200 with items and location codes                  | HTTP 200 with picking task details                                                      | **PASS**    | None     |
| **TC-32**      | Outbound           | Confirm picking scan (`POST /api/v1/deliveries/:id/pick`)                 | HTTP 200 OK with status `picked`                        | HTTP 200 OK, status `picked`                                                            | **PASS**    | None     |
| **TC-33**      | Outbound           | Ship delivery order (`POST /api/v1/deliveries/:id/ship`)                  | HTTP 200 OK with status `in_progress`                   | HTTP 200 OK, status `in_progress`                                                       | **PASS**    | None     |
| **TC-34**      | Outbound           | Complete delivery POD (`POST /api/v1/deliveries/:id/pod`)                 | HTTP 200 OK with status `completed`                     | HTTP 200 OK, status `completed`                                                         | **PASS**    | None     |
| **TC-35**      | Transfer           | List transfers (`GET /api/v1/documents?type=TRF`)                         | HTTP 200 with transfer documents                        | HTTP 200 with transfer documents list                                                   | **PASS**    | None     |
| **TC-36**      | Transfer           | Create transfer (`POST /api/v1/transfers`)                                | HTTP 201 Created with doc ID and number                 | HTTP 201 Created (`TRF/WH01/2608/00021`)                                                | **PASS**    | None     |
| **TC-37**      | Transfer           | Submit & Approve transfer                                                 | HTTP 200 OK status transitions                          | HTTP 200 OK, `submitted` -> `approved`                                                  | **PASS**    | None     |
| **TC-38**      | Transfer           | Send transfer (`POST /api/v1/transfers/:id/send`)                         | HTTP 200 OK with status `in_progress`                   | HTTP 200 OK, status `in_progress`                                                       | **PASS**    | None     |
| **TC-39**      | Transfer           | Receive transfer at WH02 (`POST /api/v1/transfers/:id/receive`)           | HTTP 200 OK with status `completed`                     | HTTP 200 OK, status `completed`                                                         | **PASS**    | None     |
| **TC-40**      | Stock              | List stock balances (`GET /api/v1/stock/balances`)                        | HTTP 200 with inventory balances per bin/lot            | HTTP 200 with detailed balance rows                                                     | **PASS**    | None     |
| **TC-41**      | Stock              | Stock card ledger (`GET /api/v1/stock/ledger?item_id=4`)                  | HTTP 200 with transaction ledger history                | HTTP 200 with ledger entries                                                            | **PASS**    | None     |
| **TC-42**      | Stock Opname       | List count sessions (`GET /api/v1/documents?type=OPN`)                    | HTTP 200 with counting sessions                         | HTTP 200 with counting sessions list                                                    | **PASS**    | None     |
| **TC-43**      | Stock Opname       | Create count session (`POST /api/v1/counts`)                              | HTTP 201 Created with session ID                        | HTTP 201 Created (`CNT/WH01/2608/00021`)                                                | **PASS**    | None     |
| **TC-44**      | Stock Opname       | Get count session detail (`GET /api/v1/counts/:id`)                       | HTTP 200 with auto-generated count lines                | HTTP 200 with count lines (lines 3..7)                                                  | **PASS**    | None     |
| **TC-45**      | Stock Opname       | Input count lines (`POST /api/v1/counts/:id/lines`)                       | HTTP 200 OK lines recorded                              | HTTP 200 OK lines recorded                                                              | **PASS**    | None     |
| **TC-46**      | Stock Opname       | Post count session (`POST /api/v1/counts/:id/post`)                       | HTTP 200 OK with status `completed`                     | HTTP 200 OK, status `completed`                                                         | **PASS**    | None     |
| **TC-47**      | Stock Opname       | Create stock adjustment (`POST /api/v1/adjustments`)                      | HTTP 201 Created with status `completed`                | HTTP 201 Created (`ADJ/WH01/2608/00021`)                                                | **PASS**    | None     |
| **TC-48**      | Reports            | FSN Analysis (`GET /api/v1/reports/fsn`)                                  | HTTP 200 with FSN turnover classifications              | HTTP 200 with item turnover data                                                        | **PASS**    | None     |
| **TC-49**      | Reports            | Inventory Valuation (`GET /api/v1/reports/valuation`)                     | HTTP 200 with FIFO/Average valuations                   | HTTP 200 with valuation figures                                                         | **PASS**    | None     |
| **TC-50**      | Reports            | Space Utilization (`GET /api/v1/reports/space-utilization`)               | HTTP 200 with zone capacity & occupancy                 | HTTP 200 with zone occupancy metrics                                                    | **PASS**    | None     |
| **TC-51**      | Dashboard          | Dashboard summary (`GET /api/v1/dashboard/summary`)                       | HTTP 200 with KPI summary metrics                       | HTTP 200 with total items & valuation                                                   | **PASS**    | None     |
| **TC-52**      | Admin              | List users (`GET /api/v1/users`)                                          | HTTP 200 with user list and roles                       | HTTP 200 with 9 seeded users                                                            | **PASS**    | None     |
| **TC-53**      | Admin              | Create user (`POST /api/v1/users`)                                        | HTTP 201 Created with new user ID                       | HTTP 201 Created, user ID returned                                                      | **PASS**    | None     |
| **TC-54**      | Admin              | List roles and permissions (`GET /roles`, `GET /permissions`)             | HTTP 200 with system roles and permissions              | HTTP 200 with roles and permissions                                                     | **PASS**    | None     |
| **TC-55**      | Admin              | Get & Update settings (`GET /settings`, `PUT /settings`)                  | HTTP 200 with updated system settings                   | HTTP 200 OK, updated: true                                                              | **PASS**    | None     |
| **TC-56**      | Admin              | List audit logs (`GET /api/v1/audit-logs`)                                | HTTP 200 with audit trail log entries                   | HTTP 200 with audit logs                                                                | **PASS**    | None     |
| **RBAC-01**    | Authorization      | `requester` access to `/api/v1/users`                                     | HTTP 403 Forbidden                                      | HTTP 403 Forbidden                                                                      | **PASS**    | None     |
| **RBAC-02**    | Authorization      | `picker` attempt to create item (`POST /items`)                           | HTTP 403 Forbidden                                      | HTTP 403 Forbidden                                                                      | **PASS**    | None     |
| **RBAC-03**    | Authorization      | `auditor` attempt to create receipt (`POST /receipts`)                    | HTTP 403 Forbidden                                      | HTTP 403 Forbidden                                                                      | **PASS**    | None     |
| **RBAC-04**    | Authorization      | `receiving` attempt to read settings (`GET /settings`)                    | HTTP 403 Forbidden                                      | HTTP 403 Forbidden                                                                      | **PASS**    | None     |
| **TC-FAIL-01** | Stock Queries      | List Batch Trace (`GET /api/v1/stock/batches`)                            | HTTP 200 with batch trace list                          | **HTTP 500 Internal Server Error** (`"Failed to retrieve batch trace"`)                 | **FAIL**    | **High** |
| **TC-FAIL-02** | Document Creation  | Fresh Document Creation on Default Seed DB                                | HTTP 201 with next sequence document number             | **HTTP 409 Conflict** (`ERR_DUPLICATE_KEY`) due to period mismatch (`202608` vs `2608`) | **FAIL**    | **High** |
| **BLK-01**     | UI Automation      | Browser subagent visual interaction                                       | Automated interactive browser session                   | **BLOCKED**: Playwright 1.57.0 driver zip returned 404 from CDN during install          | **BLOCKED** | Low      |
| **BLK-02**     | Database Migration | One-shot Docker migration container (`inventory_migrate`)                 | `migrate.sh` executes all `*.up.sql` migrations         | **BLOCKED**: Failed with `Illegal option -` due to CRLF line endings on Windows         | **BLOCKED** | Medium   |

---

## 5. Input Validation Testing

| ID              | Area           | Field/Input          | Test Scenario                                              | Expected Result                                         | Actual Result                                                       | Status   | Severity |
| --------------- | -------------- | -------------------- | ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | -------- | -------- |
| **VAL-01**      | Master Data    | `sku`                | Missing required SKU in `POST /items`                      | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-02**      | Master Data    | `name`               | Missing required name in `POST /items`                     | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-03**      | Master Data    | `base_uom`           | Missing required base_uom in `POST /items`                 | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-04**      | Master Data    | `warehouse_id`       | Missing warehouse_id in `POST /locations`                  | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-05**      | Master Data    | `loc_type`           | Missing loc_type in `POST /locations`                      | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-06**      | Master Data    | `code`               | Missing partner code in `POST /partners`                   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-07**      | Master Data    | `partner_type`       | Missing partner_type in `POST /partners`                   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-08**      | Inbound        | `lines`              | Empty lines array in `POST /receipts`                      | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-08b**     | Inbound        | `warehouse_id`       | Missing warehouse_id in `POST /receipts`                   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-09**      | Outbound       | `lines`              | Empty lines array in `POST /requests`                      | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-09b**     | Outbound       | `warehouse_id`       | Missing warehouse_id in `POST /requests`                   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-10**      | Transfers      | `dest_warehouse_id`  | Missing dest_warehouse_id in `POST /transfers`             | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-11**      | Transfers      | `dest_warehouse_id`  | Same source & destination warehouse ID (`1` == `1`)        | HTTP 422 `ERR_VALIDATION` (`"destination must differ"`) | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-12**      | Stock Opname   | `warehouse_id`       | Missing warehouse_id in `POST /counts`                     | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-13**      | Adjustments    | `reason_code`        | Missing reason_code in `POST /adjustments`                 | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-14**      | Admin          | `username`           | Missing username in `POST /users`                          | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-15**      | Admin          | `password`           | Missing password in `POST /users`                          | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-16**      | Data Types     | `warehouse_id`       | String passed instead of integer (`"invalid_string"`)      | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-17**      | Data Types     | `lines`              | Object `{}` passed instead of array `[]`                   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-18**      | Data Types     | `name`               | Boolean `true` passed instead of string                    | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-19**      | Data Types     | JSON Body            | Malformed raw JSON syntax (`{"name":`)                     | HTTP 422 `ERR_VALIDATION` (`"malformed JSON body"`)     | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-20**      | Numeric        | `min_qty`            | Negative number (`min_qty: -5`) in `POST /items`           | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-21**      | Numeric        | `max_qty`            | `max_qty (50)` less than `min_qty (100)`                   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-22**      | Numeric        | `qty`                | Zero quantity (`qty: 0`) in receipt lines                  | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-23**      | Numeric        | `qty`                | Negative quantity (`qty: -10`) in receipt lines            | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-24**      | Numeric        | Path Parameter `:id` | Non-positive item ID (`GET /items/0`)                      | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-25**      | Numeric        | Path Parameter `:id` | Non-numeric string ID (`GET /items/abc`)                   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-26**      | Numeric        | Query Parameter      | Non-positive `?warehouse_id=0` in `GET /locations`         | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-27**      | Strings        | `username`           | String too short (`"ab"` < 3 chars) in `POST /users`       | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-28**      | Strings        | `password`           | Password too short (`"12345"` < 6 chars) in `POST /users`  | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-29**      | Strings        | `sku`                | Excessively long SKU (> 50 chars) in `POST /items`         | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-30**      | Strings        | `idempotency_key`    | Malformed non-UUID format (`"not-a-valid-uuid"`)           | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-31**      | Enums          | `loc_type`           | Unsupported enum (`"cold_storage"`) in `POST /locations`   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-32**      | Enums          | `partner_type`       | Unsupported enum (`"retailer"`) in `POST /partners`        | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-33**      | Enums          | `abc_class`          | Unsupported enum (`"D"`) in `POST /items`                  | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-34**      | Enums          | `status`             | Unsupported receipt line status (`"spoiled"`)              | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-35**      | Enums          | `category`           | Unsupported attachment category (`"invoice"`)              | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-36**      | Dates          | `expiry_date`        | Invalid date format (`"19/08/2027"`) in `POST /receipts`   | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-37**      | Business Rules | `batch_no`           | Missing `batch_no` for batch-managed item (`SKU-001`)      | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-38**      | Business Rules | `expiry_date`        | Missing `expiry_date` for expiry-managed item              | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-39**      | References     | `item_id`            | Non-existent `item_id: 999999` in `POST /receipts`         | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-40**      | References     | `warehouse_id`       | Non-existent `warehouse_id: 999999` in `POST /receipts`    | HTTP 404 `ERR_NOT_FOUND`                                | HTTP 404 `ERR_NOT_FOUND`                                            | **PASS** | None     |
| **VAL-41**      | References     | `category_id`        | Non-existent `category_id: 999999` in `POST /items`        | HTTP 422 `ERR_VALIDATION`                               | HTTP 422 `ERR_VALIDATION`                                           | **PASS** | None     |
| **VAL-42**      | References     | Document ID          | Non-existent document ID (`GET /documents/999999`)         | HTTP 404 `ERR_NOT_FOUND`                                | HTTP 404 `ERR_NOT_FOUND`                                            | **PASS** | None     |
| **VAL-43**      | References     | Action ID            | Non-existent receipt ID (`POST /receipts/999999/submit`)   | HTTP 404 `ERR_NOT_FOUND`                                | HTTP 404 `ERR_NOT_FOUND`                                            | **PASS** | None     |
| **VAL-44**      | Duplicates     | `sku`                | Duplicate SKU (`"SKU-001"`) in `POST /items`               | HTTP 409 `ERR_DUPLICATE_KEY`                            | HTTP 409 `ERR_DUPLICATE_KEY`                                        | **PASS** | None     |
| **VAL-45**      | Duplicates     | `username`           | Duplicate username (`"admin"`) in `POST /users`            | HTTP 409 `ERR_DUPLICATE_KEY`                            | HTTP 409 `ERR_DUPLICATE_KEY`                                        | **PASS** | None     |
| **VAL-FAIL-01** | Master Data    | `contact_phone`      | Create Partner (`POST /partners` or `PATCH /partners/:id`) | HTTP 201 Created                                        | **HTTP 500 Internal Server Error** (`string_data_right_truncation`) | **FAIL** | **High** |

---

## 6. Bugs / Issues Found

### Bug 1: HTTP 500 on `GET /api/v1/stock/batches` (ListBatchTrace)

- **Bug ID**: `BUG-01`
- **Feature**: Stock Management / Batch Trace
- **Description**: Calling `GET /api/v1/stock/batches` throws HTTP 500 Internal Server Error (`"Failed to retrieve batch trace"`).
- **Steps to reproduce**:
    1. Log in with admin credentials to obtain JWT access token.
    2. Send `GET /api/v1/stock/batches` with `Authorization: Bearer <token>` and `X-Warehouse-Id: WH01`.
- **Expected Behavior**: HTTP 200 OK with list of batch trace items and expiration information.
- **Actual Behavior**: HTTP 500 Internal Server Error.
- **Root Cause**: In `backend/internal/repository/postgres/init.sql.go`, the SQL query for `ListBatchTrace` performs `LEFT JOIN inv.stock_balances sb` and `LEFT JOIN LATERAL (...) grn`. When a batch has no balance record or no associated GRN, `sb.status` or `grn.grn_no` are `NULL`. The generated struct `ListBatchTraceRow` defines `SbStatus` and `GrnNo` as non-nullable `string` rather than `pgtype.Text` or `*string`. The `pgx` driver fails to scan `NULL` into `*string`, causing `rows.Scan` to return an error.
- **Severity**: **High**

---

### Bug 2: Document Number Collision on Default Seeded Database (`ERR_DUPLICATE_KEY`)

- **Bug ID**: `BUG-02`
- **Feature**: Document Sequence Generation (`docnum.Generator`)
- **Description**: Creating new documents (`POST /receipts`, `POST /requests`, `POST /transfers`, `POST /counts`) on top of the initial seed data fails with HTTP 409 Conflict (`ERR_DUPLICATE_KEY`).
- **Steps to reproduce**:
    1. Set up a fresh database with migrations 000001 through 000003 applied.
    2. Attempt to create a new receipt via `POST /api/v1/receipts`.
- **Expected Behavior**: HTTP 201 Created with document number `GRN/WH01/2608/00016`.
- **Actual Behavior**: HTTP 409 Conflict with error code `ERR_DUPLICATE_KEY`.
- **Root Cause**: Migration `000003_seed_data.up.sql` seeds `doc.document_numbers` with period `'202608'` (6 digits: `YYYYMM`), but `docnum.Generator` formats and queries sequences using 4 digits `YYMM` (`'2608'`). As a result, `docnum.Generator` finds no existing sequence for period `'2608'`, starts sequence numbering from `1` (`00001`), and collides with seeded document `GRN/WH01/2608/00001` on the `UNIQUE (doc_no)` constraint.
- **Severity**: **High**

---

### Bug 3: Line Endings in `migrate.sh` Prevents Docker One-Shot Migration

- **Bug ID**: `BUG-03`
- **Feature**: Deployment & Docker Compose Migrator
- **Description**: Running `docker compose up` fails at the `migrate` service with exit code 2.
- **Steps to reproduce**:
    1. Clone repository on Windows with default Git CRLF line endings.
    2. Run `docker compose up --build`.
- **Expected Behavior**: `inventory_migrate` container runs `migrate.sh` and exits with code 0.
- **Actual Behavior**: Container logs `/migrate.sh: 9: set: Illegal option -` and exits with code 2.
- **Root Cause**: Windows CRLF line ending (`\r\n`) causes `/bin/sh` to parse `set -e\r` as an unrecognized option flag.
- **Severity**: **Medium**

---

### Bug 4: HTTP 500 on Partner Creation & Update (`POST /partners`, `PATCH /partners/:id`)

- **Bug ID**: `BUG-04`
- **Feature**: Master Data / Partner Management
- **Endpoint**: `POST /api/v1/partners`, `PATCH /api/v1/partners/:id`
- **Field/Input**: `contact_phone` (encrypted at rest)
- **Description**: Creating or updating any partner record fails with HTTP 500 Internal Server Error (`"Failed to create partner"` / `"Failed to update partner"`).
- **Steps to reproduce**:
    1. Log in with admin credentials.
    2. Send `POST /api/v1/partners` with a valid JSON payload:
        ```json
        {
            "code": "SUP-QA-01",
            "name": "PT Mitra Logistik",
            "partner_type": "supplier",
            "contact_name": "Budi",
            "contact_phone": "08123456789"
        }
        ```
- **Expected Behavior**: HTTP 201 Created with encrypted contact information stored in database.
- **Actual Behavior**: HTTP 500 Internal Server Error (`ERR_INTERNAL`).
- **Root Cause**: In `backend/internal/usecase/item/item_usecase.go`, `CreatePartner` and `UpdatePartner` encrypt `ContactPhone` with AES-256-GCM (`crypto.Encrypt`). The base64-encoded ciphertext has a minimum length of 44 characters. However, `master.partners.contact_phone` in the database schema (`000001_init.up.sql`) is defined as `VARCHAR(30)`. PostgreSQL rejects the insert with SQL state `22001` (`string_data_right_truncation: value too long for type character varying(30)`), which `writeUsecaseError` fails to map to a validation error and defaults to HTTP 500 `ERR_INTERNAL`.
- **Severity**: **High**

---

## 7. Blocked Tests

1. **BLK-01: Playwright Interactive Browser Subagent E2E Automation**
    - **Reason**: The internal browser context initialization failed because Playwright 1.57.0 driver binaries for `win32_x64` failed to download from the AzureEdge CDN (HTTP 404). Testing was substituted with the complete automated test suites (152 frontend tests, backend test suites) and comprehensive live HTTP API integration execution.
2. **BLK-02: Automated Migration via `docker compose up migrate` Container**
    - **Reason**: The Docker migration container was blocked by the CRLF line ending issue in `migrate.sh` (Bug 3). Migrations 000008 and 000009 were applied directly via `psql` to unblock integration testing.

---

## 8. Overall QA Result

### **PASS (functional) / NOT RELEASE-READY (security)**

**Final Summary & Verdict**:
Two assessment layers were completed on the `kasyfil-integrations` branch: (a) functional QA plus the re-fixing of the 4 previously-reported defects, and (b) a Docker-based vulnerability assessment and penetration test (§10). The application is **functionally sound and stable**, but the security assessment surfaced **deployment-blocking findings** that must be remediated before production.

1. **Automated Test Results**: 100% PASS (152/152 frontend Vitest component/integration tests; all Go backend unit & integration test packages).
2. **Functional & Integration Results**: Core business workflows (Inbound GRN, Outbound DO, Warehouse Transfers, Cycle Counting, Manual Adjustments, Reports, and Admin Management) successfully transition across states with RBAC authorization enforcement.
3. **Input Validation Results**: The Echo validation middleware, DTO constraints, and domain business rules properly sanitize missing fields, invalid data types, malformed JSON, out-of-range numbers, invalid enums, date formats, and non-positive path/query parameters with structured HTTP 422 `ERR_VALIDATION` responses.
4. **Defects Fixed** (all 4 re-verified as PASS, see §9):
    - `BUG-01` (High): HTTP 500 on `GET /stock/batches` — **FIXED** (COALESCE nullable columns).
    - `BUG-02` (High): Document-number sequence collision (`YYYYMM` vs `YYMM`) — **FIXED**.
    - `BUG-03` (Medium): Docker migration CRLF failure — **FIXED** (`.gitattributes` LF enforcement).
    - `BUG-04` (High): HTTP 500 on partner create/update — **FIXED** (AES-GCM encryption restored + widened columns).
5. **Total Blocked Tests**: `BLK-01` (Playwright CDN download — environmental); `BLK-02` (migration) **unblocked** by the BUG-03 fix.
6. **Security Findings** (see §10): **1 CRITICAL** (SEC-01 committed JWT secret → authentication bypass), **2 HIGH** (SEC-02 cross-warehouse BOLA, SEC-03 hardcoded AES key), **1 MEDIUM** (SEC-04 default admin credentials), **2 LOW** (SEC-05 public OpenAPI/Swagger, SEC-06 no TLS/HSTS). RBAC, warehouse-header checks, JWT alg/expiry validation, SQL-injection resistance, XSS non-reflection, rate limiting, security headers, and Argon2id hashing all verified as correctly implemented (§10.4).
7. **Verdict**: **PASS** on functional readiness — all documented functional bugs are fixed and re-verified. **NOT RELEASE-READY** on security: remediate the two P0 items (SEC-01 JWT secret rotation + SEC-02 warehouse-level object authorization) and the P1 items (SEC-03, SEC-04) before production deployment. Recommended order of action is in §10.6.

---

## 9. Bug Fix Verification (Follow-up)

All 4 defects from the previous report were fixed on branch `kasyfil-integrations` and re-verified against the live Docker stack (`docker compose up --build`). Backend test suite passes after the changes (`go test ./...`).

| Bug ID | Fix applied                                                                                      | Verification (live API)                                       | Status   |
| ------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------- |
| BUG-01 | `ListBatchTrace` query COALESCEs nullable `sb.status`/`grn.grn_no` columns (explicit `::text` cast so sqlc infers `string`) — `backend/db/queries/init.sql`, regenerated `init.sql.go` | `GET /api/v1/stock/batches` → **HTTP 200**, 10 batch-trace rows | **FIXED** |
| BUG-02 | Seed data period corrected from `YYYYMM` (`'202608'`) to `YYMM` (`'2608'`) to match `docnum.Generator` — `000003_seed_data.up.sql` & `.down.sql` | `POST /api/v1/receipts` → **HTTP 201**, `GRN/WH01/2608/00016` (no more 409) | **FIXED** |
| BUG-03 | `.gitattributes` enforces `*.sh text eol=lf`; one-shot `migrate` container applies all migrations and exits **0** | `docker compose up` → `inventory_migrate` **Exited (0)**      | **FIXED** |
| BUG-04 | Proper fix (the prior "fix" removed AES encryption — a security regression). Restored AES-256-GCM encryption + new migration `000011` widens `master.partners.contact_phone`/`contact_name` to `VARCHAR(255)` | `POST /api/v1/partners` → **HTTP 201**, ciphertext stored at rest (56-char base64), decrypt round-trips | **FIXED** |

**Note on BUG-04**: The original fix (commit `9ff202d`) had simply removed encryption and stored partner `contact_name`/`contact_phone` as plaintext — that broke the encryption unit test and exposed PII at rest. The correct fix restores AES-256-GCM encryption and widens the columns to fit the base64 ciphertext. See also `SEC-03` below for the related hardcoded-key weakness.

---

## 10. Vulnerability Assessment & Penetration Testing (Docker-based)

### 10.1 Scope & Methodology

- **Target**: SIMBAR backend API running in Docker (`http://localhost:8080`), stack = `api` + `worker` + `postgres:16` + `redis:8` (docker-compose).
- **Approach**:
    1. **Manual penetration testing** — auth/authn bypass, RBAC, broken object-level authorization (BOLA/IDOR), SQL injection, XSS reflection, rate limiting, transport security, CORS, info disclosure. JWT forgery used the committed dev secret to demonstrate authentication bypass.
    2. **Automated scanners (Docker-based)** — OWASP ZAP baseline (web app), Nikto (web server fingerprinting/misconfiguration), Trivy (container image CVE scan of `simbar-backend:latest`).
    3. **Static code review** — secrets/keys, auth configuration, query construction, crypto usage.
- **Date**: 2026-08-19. **Branch**: `kasyfil-integrations`.
- **Remediation status**: Not yet applied (findings documented for developer action).

### 10.2 Executive Summary

The application's **role-based authorization (RBAC), password hashing, input validation, and rate limiting are solid**, and the previous bugs are fixed. However, **the deployed configuration is not production-safe**: the JWT signing secret is committed to the repository, which allows **full authentication bypass** (anyone can forge a sysadmin token), and **document endpoints are missing warehouse-level object authorization**, allowing cross-warehouse data reads. Two cryptographic secrets (JWT secret, AES data key) are hardcoded.

| Severity | Count |
| -------- | ----- |
| **CRITICAL** | 1 |
| **HIGH** | 2 |
| **MEDIUM** | 1 |
| **LOW** | 2 |

### 10.3 Findings (Manual + Static Review)

#### SEC-01 — CRITICAL: JWT signing secret is known → full authentication bypass

- **Endpoint**: all `/api/v1/*` protected routes.
- **Description**: The HS256 JWT secret is committed to the repository:
    - `docker-compose.yml:74,104` → `JWT_SECRET=dev-only-jwt-secret-change-me-0123456789`
    - `backend/internal/config/config.go:23` → `getEnv("JWT_SECRET", "super-secret-key")` (default fallback)
    - `config.go:35` enforces a 32-char minimum **only when `APP_ENV=production`**.
- **PoC**: A JWT signed with the committed secret and claims `roles=["sysadmin"], warehouses=["WH01"]` was accepted:
    - `GET /api/v1/users` (forged sysadmin) → **HTTP 200**, returned user list incl. `admin`, `imanager`, `supervisor` with their roles.
- **Impact**: Anyone who can read the repo (or who leaks the secret via the container image / env) can mint tokens as **any role for any warehouse** — full compromise: create users, approve/reject documents, read/modify stock, exfiltrate PII. The `alg=none` and wrong-secret vectors are correctly rejected, but that does not help while the real secret is public.
- **Remediation**:
    1. Generate a cryptographically random secret ≥ 32 bytes at deploy time (e.g. `openssl rand -base64 32`); store in a secret manager / `.env` that is **never committed**.
    2. Remove the insecure defaults; make the app **refuse to start** if the secret is missing, is the known default, or is < 32 bytes — in all environments, not just production.
    3. Rotate the secret (invalidate previously issued tokens).
    4. Ensure `docker-compose.yml` does not ship a real secret.

#### SEC-02 — HIGH: Broken Object-Level Authorization (cross-warehouse document read)

- **Endpoints**: `GET /api/v1/documents` and `GET /api/v1/documents/:id` (and related detail routes).
- **Description**: A user assigned to only warehouse WH02 can list and read documents belonging to warehouse WH01.
- **PoC** (forged `inventory_manager`, `warehouses=["WH02"]`):
    - `GET /api/v1/documents` (no `warehouse_id` query param) → **HTTP 200** with 17 documents, including `GRN/WH01/2608/00016`, `DO/WH01/2608/00012`, `TRF/WH01/...`.
    - `GET /api/v1/documents?warehouse_id=1` → **HTTP 200** (returns WH01 documents).
    - `GET /api/v1/documents/17` → **HTTP 200** with the full WH01 GRN (header, warehouse, line items, SKUs, quantities).
- **Root cause**: `ListDocuments` filters with `($3 = 0 OR d.warehouse_id = $3)` where `$3` comes from the unvalidated `?warehouse_id` query parameter — it is never checked against the caller's assigned warehouses (JWT `warehouses` claim). The warehouse middleware only validates the `X-Warehouse-Id` header value, which is ignored by the list filter. `GetDocumentDetail` takes **only** `id` (handler → usecase → repo), so it has no warehouse scope at all.
- **Impact**: Confidentiality breach across warehouses in a multi-warehouse deployment; combined with SEC-01, trivial to exploit. The RBAC role check (`stock:read`) is enforced, but warehouse scoping is not.
- **Remediation**:
    1. Derive the warehouse scope from the authenticated JWT claims, and reject (`403`) any `?warehouse_id` that is not among the caller's warehouses.
    2. Scope `GetDocumentDetail` (and `GetCountDocumentDetail`) by the caller's warehouses — return `404`/`403` when the document belongs to an out-of-scope warehouse.
    3. Add integration tests with per-warehouse users covering list and detail endpoints.

#### SEC-03 — HIGH: Hardcoded AES-256-GCM key for PII at rest

- **Location**: `backend/internal/usecase/item/item_usecase.go:17` → `var AESKey = []byte("this-is-a-very-secret-32byte-key")`.
- **Description**: The AES key used to encrypt partner `contact_name`/`contact_phone` (BUG-04 fix) is a hardcoded literal in source.
- **Impact**: Anyone with source code or DB access can decrypt the stored PII — the encryption provides confidentiality only against attackers without repo access.
- **Remediation**: Use a key-management service (AWS KMS / Google Cloud KMS / Vault) or an environment-injected key; support key rotation; consider envelope encryption (per-row DEK wrapped by a master key).

#### SEC-04 — MEDIUM: Default admin credentials still active

- **Endpoint**: `POST /api/v1/auth/login`.
- **Description**: Seed migration `000002_seed_rbac.up.sql:100` bootstraps `admin` with an Argon2id hash of `Admin@123456` (comment: *"change after first login!"*). `POST /auth/login` with `admin`/`Admin@123456` → **HTTP 200** with valid tokens; no forced password change was observed on first login.
- **Impact**: If credentials are not rotated after deployment, anyone can log in as a full sysadmin.
- **Remediation**: Force a password change on first login; disable/disallow default seeds in production; audit logins with default credentials; rotate the admin password immediately.

#### SEC-05 — LOW: Public OpenAPI spec & Swagger UI (information disclosure)

- **PoC**: `GET /api/v1/openapi.json` → **HTTP 200**; `GET /swagger` → **HTTP 200** (unauthenticated).
- **Impact**: Exposes the full API surface (routes, parameters, schemas), which lowers the barrier for attackers. Acceptable for dev; should be disabled/gated in production.
- **Remediation**: Serve documentation only in dev, or behind authentication in production.

#### SEC-06 — LOW: No TLS / no HSTS on API

- **PoC**: API is served over plain HTTP; no `Strict-Transport-Security` header on responses.
- **Impact**: Over an unencrypted production channel, credentials and JWTs can be intercepted (tokens also travel as `Authorization: Bearer` headers).
- **Remediation**: Terminate TLS at the reverse proxy; set `Strict-Transport-Security`; redirect HTTP → HTTPS; ensure JWTs are never transmitted over plain HTTP in production.

### 10.4 Security Controls Verified (Positive)

| ID    | Control                                                      | Result |
| ----- | ------------------------------------------------------------ | ------ |
| P-01  | Wrong JWT secret → signature rejected                         | `401` ✓ |
| P-02  | `alg=none` token rejected (HMAC-method enforcement)           | `401` ✓ |
| P-03  | Expired token rejected                                        | `401` ✓ |
| P-04  | RBAC (Casbin): `requester` → `GET /users` and `POST /partners` | `403` ✓ |
| P-05  | Warehouse assignment on header: WH02-only user + `X-Warehouse-Id: WH01` → `GET /items` | `403` ✓ |
| P-06  | Missing `X-Warehouse-Id` header                               | `400` ✓ |
| P-07  | SQL injection attempts (login username, `?search=`) — parameterized queries | No injection (`200`/`401`, no error) ✓ |
| P-08  | XSS payload (`<script>alert(1)</script>`) not reflected        | ✓ |
| P-09  | Login rate limiting (25 attempts / 15 min per IP, Redis sliding window) — 30 bad logins → `429`; further logins blocked for the window | `429` ✓ |
| P-10  | Security headers present on protected **and** public endpoints: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Content-Security-Policy: default-src 'self'`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`; no `Server` banner leak | ✓ |
| P-11  | CORS not enabled — hostile-origin preflight gets no `Access-Control-Allow-Origin` | ✓ |
| P-12  | Passwords hashed with Argon2id (`m=64MB, t=3, p=2`)            | ✓ |
| P-13  | Audit logging present (`GET /api/v1/audit-logs`)               | ✓ |

### 10.5 Automated Scanner Results (Docker-based)

**Nikto v2.6.1** (built from `sullo/nikto` in an Alpine container, `--network host`, `-Tuning 1234bde`)

- **4486 requests, 0 errors, 2 items reported**, scan time 20s.
- Findings:
    1. `/: Uncommon header 'x-request-id' found` — request-tracking header (informational; not a vulnerability).
    2. `/: Suggested security header missing: strict-transport-security` — **confirms SEC-06** (no HSTS).
- Positive: **no server banner retrieved** — the API does not disclose its framework/version in response headers (no version-disclosure finding).

**OWASP ZAP baseline** (`ghcr.io/zaproxy/zaproxy`) — **could not complete in this environment.** The ZAP image pull from `ghcr.io` stalled on a large layer and the registry connection was throttled/unreliable, so the automated web scan did not run. Equivalent coverage was obtained manually (§10.3, §10.4): authentication/RBAC/IDOR, injection/XSS, rate limiting, security headers (verified present, see P-10), CORS, and info disclosure. ZAP baseline is recommended as a scheduled CI job where registry access is stable (see 10.6 P2).

**Trivy** (`aquasec/trivy image simbar-backend:latest`) — **CVE scan could not complete in this environment.** Trivy's 108 MiB vulnerability-DB download from `mirror.gcr.io` was throttled (~20–110 KiB/s) and the run died mid-download after multiple retries (first at timeout, then connection drop at ~57%). No CVE results are therefore claimed here.

Manual composition assessment of `simbar-backend:latest` (substitute for the unavailable DB lookup):

- **Runtime base**: `alpine:3.20.10` (current patch) with a minimal package set — `musl 1.2.5-r3`, `busybox 1.36.1-r31`, `libcrypto3/libssl3 3.3.7-r0` (OpenSSL), `zlib 1.3.2-r0`, `ca-certificates`, `tzdata`, `apk-tools` — all at the current revision for the 3.20 branch, so no stale OS-package versions were found.
- **Application**: single static Go 1.25.0 binary (`/app/api`, 28.7 MB, `CGO_ENABLED=0`, `-trimpath -ldflags "-s -w"`). No shell utilities or build tooling are shipped in the runtime image (only `ca-certificates`/`tzdata` added on top of alpine).
- **Supply-chain note**: a full `trivy image` run (including Go-module advisories for the 27 direct/indirect deps — echo v4.15.4, pgx v5.10.0, casbin v2.135.0, golang-jwt v5.3.1, golang.org/x/* etc.) must be executed in CI with stable registry access before production deployment.

### 10.6 Recommendations (Prioritized)

| Priority | Action | Findings addressed |
| -------- | ------ | ------------------ |
| **P0 — Deploy block** | Move the JWT secret out of the repo/env into a secret manager with a random ≥32-byte value; refuse to start on missing/short/known-default secrets; rotate the current secret. | SEC-01 |
| **P0 — Deploy block** | Scope all document (and count) reads/writes to the caller's assigned warehouses (from JWT claims); reject `?warehouse_id` outside the caller's warehouses with `403`; add per-warehouse integration tests. | SEC-02 |
| P1 | Move the AES data key to KMS/env-injected key with rotation; consider envelope encryption for PII. | SEC-03 |
| P1 | Force password change on first login; remove/disable default-seeded credentials in production; rotate the current admin password. | SEC-04 |
| P2 | Gate OpenAPI/Swagger behind dev-only or auth. | SEC-05 |
| P2 | Enforce TLS + HSTS behind the reverse proxy in production. | SEC-06 |
| P2 | Run ZAP + Nikto + Trivy as a scheduled CI job (stable registry access) so the scans in §10.5 are reproducible. | — |

**Note on SEC-01 severity**: the RBAC layer, warehouse-header check, `alg=none` protection, and Argon2id hashing are all correctly implemented — they were verified in §10.4. But a known signing secret bypasses the entire authentication layer, which is why SEC-01 is rated CRITICAL and blocks production deployment regardless of the otherwise-sound controls.
