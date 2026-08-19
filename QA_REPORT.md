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
- **Failed**: 3
- **Blocked**: 2

---

## 4. Functional & Integration Test Cases

| ID | Area | Scenario | Expected Result | Actual Result | Status | Severity |
|---|---|---|---|---|---|---|
| **AUTO-FE** | Automated Tests | Run frontend test suite (68 test files / 152 tests) | All component and integration tests pass | 152/152 tests passed in 662s | **PASS** | None |
| **AUTO-BE** | Automated Tests | Run backend test suite (`go test ./...`) | All unit and integration test packages pass | All packages passed (including postgres integration tests) | **PASS** | None |
| **TC-01** | System Health | Backend health liveness probe (`GET /healthz`) | HTTP 200 `{"status":"ok"}` | HTTP 200 `{"status":"ok"}` | **PASS** | None |
| **TC-02** | Auth | Login with invalid password | HTTP 401 Unauthorized with `ERR_UNAUTHENTICATED` | HTTP 401 `ERR_UNAUTHENTICATED` returned | **PASS** | None |
| **TC-03** | Auth | Login with valid admin credentials | HTTP 200 OK with JWT `access_token` and `refresh_token` | HTTP 200 OK with valid JWT tokens | **PASS** | None |
| **TC-04** | Auth | Token refresh (`POST /api/v1/auth/refresh`) | HTTP 200 OK with newly issued `access_token` | HTTP 200 OK with refreshed access token | **PASS** | None |
| **TC-05** | Master Data | List items (`GET /api/v1/items`) | HTTP 200 with array of item objects | HTTP 200, returned 11 items | **PASS** | None |
| **TC-06** | Master Data | Get item detail (`GET /api/v1/items/:id`) | HTTP 200 with item data and UoM conversions | HTTP 200, returned item details and 2 UoMs | **PASS** | None |
| **TC-07** | Master Data | List warehouses (`GET /api/v1/warehouses`) | HTTP 200 with warehouse list (`WH01`, `WH02`) | HTTP 200, returned 2 active warehouses | **PASS** | None |
| **TC-08** | Master Data | List locations (`GET /api/v1/locations?warehouse_id=1`) | HTTP 200 with location bins for warehouse | HTTP 200, returned 8 location bins | **PASS** | None |
| **TC-09** | Master Data | List partners (`GET /api/v1/partners`) | HTTP 200 with suppliers and customers | HTTP 200, returned 6 partner records | **PASS** | None |
| **TC-10** | Master Data | List categories (`GET /api/v1/categories`) | HTTP 200 with item categories | HTTP 200, returned 6 categories | **PASS** | None |
| **TC-11** | Master Data | Create new item (`POST /api/v1/items`) | HTTP 201 Created with generated item ID | HTTP 201 Created, ID returned | **PASS** | None |
| **TC-12** | Master Data | Update existing item (`PATCH /api/v1/items/:id`) | HTTP 200 OK with updated item attributes | HTTP 200 OK, updated attributes reflected | **PASS** | None |
| **TC-13** | Inbound | List GRN documents (`GET /api/v1/documents?type=GRN`) | HTTP 200 with GRN documents | HTTP 200 with GRN document list | **PASS** | None |
| **TC-14** | Inbound | Get GRN detail (`GET /api/v1/documents/:id`) | HTTP 200 with header, lines, and partners | HTTP 200 with complete GRN lines and partner info | **PASS** | None |
| **TC-15** | Inbound | Create GRN document (`POST /api/v1/receipts`) | HTTP 201 Created with doc ID and number | HTTP 201 Created (`GRN/WH01/2608/00021`) | **PASS** | None |
| **TC-16** | Inbound | Submit GRN draft (`POST /api/v1/receipts/:id/submit`) | HTTP 200 OK with status `submitted` | HTTP 200 OK, status `submitted` | **PASS** | None |
| **TC-17** | Inbound | Approve GRN (`POST /api/v1/receipts/:id/approve`) | HTTP 200 OK with status `approved` | HTTP 200 OK, status `approved` | **PASS** | None |
| **TC-18** | Inbound | Get putaway suggestions (`GET /api/v1/receipts/:id/putaway-suggestion`) | HTTP 200 with candidate bin locations | HTTP 200 with ranked locations (`PK-01-01`, etc.) | **PASS** | None |
| **TC-19** | Inbound | Execute putaway (`POST /api/v1/receipts/:id/putaway`) | HTTP 200 OK with status `completed` | HTTP 200 OK, status `completed` | **PASS** | None |
| **TC-20** | Inbound | Add GRN attachment (`POST /api/v1/receipts/:id/attachments`) | HTTP 201 Created with attachment ID | HTTP 201 Created, ID 1 | **PASS** | None |
| **TC-21** | Inbound | List GRN attachments (`GET /api/v1/receipts/:id/attachments`) | HTTP 200 with list of document attachments | HTTP 200 with 1 attachment entry | **PASS** | None |
| **TC-22** | Inbound | Delete GRN attachment (`DELETE /api/v1/receipts/:id/attachments/:att_id`) | HTTP 200 OK with `{"deleted": true}` | HTTP 200 OK with `{"deleted": true}` | **PASS** | None |
| **TC-23** | Outbound | List requests (`GET /api/v1/documents?type=REQ`) | HTTP 200 with outbound requests | HTTP 200 with request list | **PASS** | None |
| **TC-24** | Outbound | Create outbound request (`POST /api/v1/requests`) | HTTP 201 Created with doc ID and number | HTTP 201 Created (`REQ/WH01/2608/00021`) | **PASS** | None |
| **TC-25** | Outbound | Submit request draft (`POST /api/v1/requests/:id/submit`) | HTTP 200 OK with status `submitted` | HTTP 200 OK, status `submitted` | **PASS** | None |
| **TC-26** | Outbound | Approve request (`POST /api/v1/requests/:id/approve`) | HTTP 200 OK with status `approved` | HTTP 200 OK, status `approved` | **PASS** | None |
| **TC-27** | Outbound | List deliveries (`GET /api/v1/documents?type=DO`) | HTTP 200 with delivery orders | HTTP 200 with delivery orders list | **PASS** | None |
| **TC-28** | Outbound | Create delivery order (`POST /api/v1/deliveries`) | HTTP 201 Created with doc ID and number | HTTP 201 Created (`DO/WH01/2608/00021`) | **PASS** | None |
| **TC-29** | Outbound | Submit & Approve DO | HTTP 200 OK status transitions | HTTP 200 OK, `submitted` -> `approved` | **PASS** | None |
| **TC-30** | Outbound | Allocate stock for DO (`POST /api/v1/deliveries/:id/allocate`) | HTTP 200 OK with allocated balance lots | HTTP 200 OK, 1 allocation generated | **PASS** | None |
| **TC-31** | Outbound | Get picking list (`GET /api/v1/deliveries/:id/picking-list`) | HTTP 200 with items and location codes | HTTP 200 with picking task details | **PASS** | None |
| **TC-32** | Outbound | Confirm picking scan (`POST /api/v1/deliveries/:id/pick`) | HTTP 200 OK with status `picked` | HTTP 200 OK, status `picked` | **PASS** | None |
| **TC-33** | Outbound | Ship delivery order (`POST /api/v1/deliveries/:id/ship`) | HTTP 200 OK with status `in_progress` | HTTP 200 OK, status `in_progress` | **PASS** | None |
| **TC-34** | Outbound | Complete delivery POD (`POST /api/v1/deliveries/:id/pod`) | HTTP 200 OK with status `completed` | HTTP 200 OK, status `completed` | **PASS** | None |
| **TC-35** | Transfer | List transfers (`GET /api/v1/documents?type=TRF`) | HTTP 200 with transfer documents | HTTP 200 with transfer documents list | **PASS** | None |
| **TC-36** | Transfer | Create transfer (`POST /api/v1/transfers`) | HTTP 201 Created with doc ID and number | HTTP 201 Created (`TRF/WH01/2608/00021`) | **PASS** | None |
| **TC-37** | Transfer | Submit & Approve transfer | HTTP 200 OK status transitions | HTTP 200 OK, `submitted` -> `approved` | **PASS** | None |
| **TC-38** | Transfer | Send transfer (`POST /api/v1/transfers/:id/send`) | HTTP 200 OK with status `in_progress` | HTTP 200 OK, status `in_progress` | **PASS** | None |
| **TC-39** | Transfer | Receive transfer at WH02 (`POST /api/v1/transfers/:id/receive`) | HTTP 200 OK with status `completed` | HTTP 200 OK, status `completed` | **PASS** | None |
| **TC-40** | Stock | List stock balances (`GET /api/v1/stock/balances`) | HTTP 200 with inventory balances per bin/lot | HTTP 200 with detailed balance rows | **PASS** | None |
| **TC-41** | Stock | Stock card ledger (`GET /api/v1/stock/ledger?item_id=4`) | HTTP 200 with transaction ledger history | HTTP 200 with ledger entries | **PASS** | None |
| **TC-42** | Stock Opname | List count sessions (`GET /api/v1/documents?type=OPN`) | HTTP 200 with counting sessions | HTTP 200 with counting sessions list | **PASS** | None |
| **TC-43** | Stock Opname | Create count session (`POST /api/v1/counts`) | HTTP 201 Created with session ID | HTTP 201 Created (`CNT/WH01/2608/00021`) | **PASS** | None |
| **TC-44** | Stock Opname | Get count session detail (`GET /api/v1/counts/:id`) | HTTP 200 with auto-generated count lines | HTTP 200 with count lines (lines 3..7) | **PASS** | None |
| **TC-45** | Stock Opname | Input count lines (`POST /api/v1/counts/:id/lines`) | HTTP 200 OK lines recorded | HTTP 200 OK lines recorded | **PASS** | None |
| **TC-46** | Stock Opname | Post count session (`POST /api/v1/counts/:id/post`) | HTTP 200 OK with status `completed` | HTTP 200 OK, status `completed` | **PASS** | None |
| **TC-47** | Stock Opname | Create stock adjustment (`POST /api/v1/adjustments`) | HTTP 201 Created with status `completed` | HTTP 201 Created (`ADJ/WH01/2608/00021`) | **PASS** | None |
| **TC-48** | Reports | FSN Analysis (`GET /api/v1/reports/fsn`) | HTTP 200 with FSN turnover classifications | HTTP 200 with item turnover data | **PASS** | None |
| **TC-49** | Reports | Inventory Valuation (`GET /api/v1/reports/valuation`) | HTTP 200 with FIFO/Average valuations | HTTP 200 with valuation figures | **PASS** | None |
| **TC-50** | Reports | Space Utilization (`GET /api/v1/reports/space-utilization`) | HTTP 200 with zone capacity & occupancy | HTTP 200 with zone occupancy metrics | **PASS** | None |
| **TC-51** | Dashboard | Dashboard summary (`GET /api/v1/dashboard/summary`) | HTTP 200 with KPI summary metrics | HTTP 200 with total items & valuation | **PASS** | None |
| **TC-52** | Admin | List users (`GET /api/v1/users`) | HTTP 200 with user list and roles | HTTP 200 with 9 seeded users | **PASS** | None |
| **TC-53** | Admin | Create user (`POST /api/v1/users`) | HTTP 201 Created with new user ID | HTTP 201 Created, user ID returned | **PASS** | None |
| **TC-54** | Admin | List roles and permissions (`GET /roles`, `GET /permissions`) | HTTP 200 with system roles and permissions | HTTP 200 with roles and permissions | **PASS** | None |
| **TC-55** | Admin | Get & Update settings (`GET /settings`, `PUT /settings`) | HTTP 200 with updated system settings | HTTP 200 OK, updated: true | **PASS** | None |
| **TC-56** | Admin | List audit logs (`GET /api/v1/audit-logs`) | HTTP 200 with audit trail log entries | HTTP 200 with audit logs | **PASS** | None |
| **RBAC-01** | Authorization | `requester` access to `/api/v1/users` | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** | None |
| **RBAC-02** | Authorization | `picker` attempt to create item (`POST /items`) | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** | None |
| **RBAC-03** | Authorization | `auditor` attempt to create receipt (`POST /receipts`) | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** | None |
| **RBAC-04** | Authorization | `receiving` attempt to read settings (`GET /settings`) | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** | None |
| **TC-FAIL-01** | Stock Queries | List Batch Trace (`GET /api/v1/stock/batches`) | HTTP 200 with batch trace list | **HTTP 500 Internal Server Error** (`"Failed to retrieve batch trace"`) | **FAIL** | **High** |
| **TC-FAIL-02** | Document Creation | Fresh Document Creation on Default Seed DB | HTTP 201 with next sequence document number | **HTTP 409 Conflict** (`ERR_DUPLICATE_KEY`) due to period mismatch (`202608` vs `2608`) | **FAIL** | **High** |
| **BLK-01** | UI Automation | Browser subagent visual interaction | Automated interactive browser session | **BLOCKED**: Playwright 1.57.0 driver zip returned 404 from CDN during install | **BLOCKED** | Low |
| **BLK-02** | Database Migration | One-shot Docker migration container (`inventory_migrate`) | `migrate.sh` executes all `*.up.sql` migrations | **BLOCKED**: Failed with `Illegal option -` due to CRLF line endings on Windows | **BLOCKED** | Medium |

---

## 5. Input Validation Testing

| ID | Area | Field/Input | Test Scenario | Expected Result | Actual Result | Status | Severity |
|---|---|---|---|---|---|---|---|
| **VAL-01** | Master Data | `sku` | Missing required SKU in `POST /items` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-02** | Master Data | `name` | Missing required name in `POST /items` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-03** | Master Data | `base_uom` | Missing required base_uom in `POST /items` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-04** | Master Data | `warehouse_id` | Missing warehouse_id in `POST /locations` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-05** | Master Data | `loc_type` | Missing loc_type in `POST /locations` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-06** | Master Data | `code` | Missing partner code in `POST /partners` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-07** | Master Data | `partner_type` | Missing partner_type in `POST /partners` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-08** | Inbound | `lines` | Empty lines array in `POST /receipts` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-08b**| Inbound | `warehouse_id` | Missing warehouse_id in `POST /receipts` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-09** | Outbound | `lines` | Empty lines array in `POST /requests` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-09b**| Outbound | `warehouse_id` | Missing warehouse_id in `POST /requests` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-10** | Transfers | `dest_warehouse_id` | Missing dest_warehouse_id in `POST /transfers` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-11** | Transfers | `dest_warehouse_id` | Same source & destination warehouse ID (`1` == `1`) | HTTP 422 `ERR_VALIDATION` (`"destination must differ"`) | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-12** | Stock Opname | `warehouse_id` | Missing warehouse_id in `POST /counts` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-13** | Adjustments | `reason_code` | Missing reason_code in `POST /adjustments` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-14** | Admin | `username` | Missing username in `POST /users` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-15** | Admin | `password` | Missing password in `POST /users` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-16** | Data Types | `warehouse_id` | String passed instead of integer (`"invalid_string"`) | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-17** | Data Types | `lines` | Object `{}` passed instead of array `[]` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-18** | Data Types | `name` | Boolean `true` passed instead of string | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-19** | Data Types | JSON Body | Malformed raw JSON syntax (`{"name":`) | HTTP 422 `ERR_VALIDATION` (`"malformed JSON body"`) | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-20** | Numeric | `min_qty` | Negative number (`min_qty: -5`) in `POST /items` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-21** | Numeric | `max_qty` | `max_qty (50)` less than `min_qty (100)` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-22** | Numeric | `qty` | Zero quantity (`qty: 0`) in receipt lines | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-23** | Numeric | `qty` | Negative quantity (`qty: -10`) in receipt lines | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-24** | Numeric | Path Parameter `:id` | Non-positive item ID (`GET /items/0`) | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-25** | Numeric | Path Parameter `:id` | Non-numeric string ID (`GET /items/abc`) | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-26** | Numeric | Query Parameter | Non-positive `?warehouse_id=0` in `GET /locations` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-27** | Strings | `username` | String too short (`"ab"` < 3 chars) in `POST /users` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-28** | Strings | `password` | Password too short (`"12345"` < 6 chars) in `POST /users` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-29** | Strings | `sku` | Excessively long SKU (> 50 chars) in `POST /items` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-30** | Strings | `idempotency_key` | Malformed non-UUID format (`"not-a-valid-uuid"`) | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-31** | Enums | `loc_type` | Unsupported enum (`"cold_storage"`) in `POST /locations` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-32** | Enums | `partner_type` | Unsupported enum (`"retailer"`) in `POST /partners` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-33** | Enums | `abc_class` | Unsupported enum (`"D"`) in `POST /items` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-34** | Enums | `status` | Unsupported receipt line status (`"spoiled"`) | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-35** | Enums | `category` | Unsupported attachment category (`"invoice"`) | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-36** | Dates | `expiry_date` | Invalid date format (`"19/08/2027"`) in `POST /receipts` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-37** | Business Rules | `batch_no` | Missing `batch_no` for batch-managed item (`SKU-001`) | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-38** | Business Rules | `expiry_date` | Missing `expiry_date` for expiry-managed item | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-39** | References | `item_id` | Non-existent `item_id: 999999` in `POST /receipts` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-40** | References | `warehouse_id` | Non-existent `warehouse_id: 999999` in `POST /receipts` | HTTP 404 `ERR_NOT_FOUND` | HTTP 404 `ERR_NOT_FOUND` | **PASS** | None |
| **VAL-41** | References | `category_id` | Non-existent `category_id: 999999` in `POST /items` | HTTP 422 `ERR_VALIDATION` | HTTP 422 `ERR_VALIDATION` | **PASS** | None |
| **VAL-42** | References | Document ID | Non-existent document ID (`GET /documents/999999`) | HTTP 404 `ERR_NOT_FOUND` | HTTP 404 `ERR_NOT_FOUND` | **PASS** | None |
| **VAL-43** | References | Action ID | Non-existent receipt ID (`POST /receipts/999999/submit`) | HTTP 404 `ERR_NOT_FOUND` | HTTP 404 `ERR_NOT_FOUND` | **PASS** | None |
| **VAL-44** | Duplicates | `sku` | Duplicate SKU (`"SKU-001"`) in `POST /items` | HTTP 409 `ERR_DUPLICATE_KEY` | HTTP 409 `ERR_DUPLICATE_KEY` | **PASS** | None |
| **VAL-45** | Duplicates | `username` | Duplicate username (`"admin"`) in `POST /users` | HTTP 409 `ERR_DUPLICATE_KEY` | HTTP 409 `ERR_DUPLICATE_KEY` | **PASS** | None |
| **VAL-FAIL-01** | Master Data | `contact_phone` | Create Partner (`POST /partners` or `PATCH /partners/:id`) | HTTP 201 Created | **HTTP 500 Internal Server Error** (`string_data_right_truncation`) | **FAIL** | **High** |

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

### **PASS WITH ISSUES**

**Final Summary & Verdict**:
All testing performed on the `kasyfil-integrations` branch—comprising automated unit/integration suites, functional workflow lifecycles, and input validation/error handling passes—confirms that the application is functional and well-integrated, but contains 4 specific defects that require developer attention:

1. **Automated Test Results**: 100% PASS (152/152 frontend Vitest component/integration tests; all Go backend unit & integration test packages).
2. **Functional & Integration Results**: Core business workflows (Inbound GRN, Outbound DO, Warehouse Transfers, Cycle Counting, Manual Adjustments, Reports, and Admin Management) successfully transition across states with RBAC authorization enforcement.
3. **Input Validation Results**: The Echo validation middleware, DTO constraints, and domain business rules properly sanitize missing fields, invalid data types, malformed JSON, out-of-range numbers, invalid enums, date formats, and non-positive path/query parameters with structured HTTP 422 `ERR_VALIDATION` responses.
4. **Total Bugs Found**: 4 defects:
   - `BUG-01` (High): HTTP 500 on `GET /stock/batches` due to nullable column scanning into Go string.
   - `BUG-02` (High): Document number sequence collision on pre-seeded database due to `YYYYMM` vs `YYMM` period format mismatch.
   - `BUG-03` (Medium): Docker migration container failure due to CRLF line termination in `migrate.sh`.
   - `BUG-04` (High): HTTP 500 on partner creation/update due to AES ciphertext length exceeding `VARCHAR(30)` column constraint.
5. **Total Blocked Tests**: 2 environment/infrastructure items (`BLK-01`, `BLK-02`).
6. **Verdict**: **PASS WITH ISSUES**. The integration is functional and stable for primary workflows, and addressing the 4 identified issues will bring the application to full release compliance.
