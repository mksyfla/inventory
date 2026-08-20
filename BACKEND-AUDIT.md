# Backend Audit — `mksyfla/inventory` (SIMBAR)

**Scope:** `backend/` — Go 1.25, Echo v4, pgx v5 + sqlc, Casbin, asynq, Redis.
**Size:** ~19,300 LOC production, ~12,400 LOC test, 185 files.
**Lens:** enterprise multi-tenant, high traffic; security; clean code.
**Method:** static review (no Go toolchain / module proxy available in the audit sandbox — nothing was compiled or executed).

---

## 0. Executive summary

The architecture is genuinely good. Clean layering (`domain` → `usecase` → `repository` / `delivery`) is respected almost everywhere, SQL is fully parameterised through sqlc, the stock-posting core does deterministic lock ordering to avoid deadlocks, `stock_movements` is partitioned and append-only at the DB level, maker-checker is enforced by a DB `CHECK` constraint as well as in code, and there is a real test suite including a 50-goroutine concurrency test. This is well above the median for a project of this size.

The problems are concentrated in one place: **authorization is enforced on a request header that the data layer never uses.**

The `X-Warehouse-Id` header is checked against the caller's JWT claims by `RBACMiddleware` — correctly. But every handler downstream then takes the warehouse from the **request body** or a **query parameter**, and no usecase ever re-checks it. The header and the body aren't even the same type (the header carries a warehouse *code*, the body carries a numeric *id*), so they were never going to reconcile. The result is that the entire access-control model is decorative: it validates a value, then discards it and acts on a different attacker-controlled value.

The repo's own `vapt.md` already identifies part of this as SEC-02 (read-side IDOR). It is broader than documented — it extends to **writes and to stock-posting approvals**, which is the difference between an information disclosure and an inventory-integrity compromise.

Separately: **there is no multi-tenancy.** Zero occurrences of `tenant`, `org_id`, `company_id` anywhere in the Go or SQL. `warehouse_id` is the only scoping dimension and, as above, it isn't enforced. Section 6 covers what adding tenancy actually requires.

**Counts:** 7 Critical · 12 High · 14 Medium · assorted Low.

**Do not deploy to a multi-tenant or internet-facing environment until C-01 through C-07 are closed.**

---

## 1. Critical findings

### C-01 — Cross-warehouse write escalation via request body
`internal/delivery/http/handler/{receipt,outbound,transfer,counting,item}.go`

Every create handler reads the warehouse from the body:

```go
in := inbound.CreateInput{
    WarehouseID: req.WarehouseID,   // ← attacker-controlled, never validated
    ...
}
```

The usecase only confirms the warehouse *exists*:

```go
wh, err := u.warehouses.GetWarehouseByID(ctx, in.WarehouseID)  // existence, not authorization
```

**Exploit.** A user assigned only to `WH01` sends `X-Warehouse-Id: WH01` (passes the middleware) with `{"warehouse_id": 2, ...}` in the body. The document is created in `WH02`.

Affects `POST /receipts`, `/requests`, `/deliveries`, `/transfers`, `/counts`, `/adjustments`, `/locations`.

**Fix.** Resolve the warehouse once in middleware, put the resolved numeric ID in the request context, and make it the *only* source. Delete `warehouse_id` from every request DTO — a field the client shouldn't control shouldn't be in the contract.

```go
// middleware, after the assignment check
whID, err := resolveWarehouseID(ctx, warehouseCode)   // code → id, cached
c.Set(ctxWarehouseID, whID)

// handler
in := inbound.CreateInput{ WarehouseID: warehouseIDFromCtx(c), ... }
```

---

### C-02 — Cross-warehouse approval and stock posting
`internal/usecase/inbound/receipt.go:257` and equivalents in `outbound`, `transfer`, `counting`

```go
func (u *ReceiptUsecase) Approve(ctx context.Context, id, approverID int64) error {
    doc, lines, err := u.docs.GetByID(ctx, id)
    if err != nil { return err }
    if err := document.ValidateApprover(doc.CreatedBy, approverID); err != nil { return err }
    // ... posts stock movements. doc.WarehouseID is never checked against the approver.
```

The maker-checker rule is enforced. Warehouse ownership is not.

**Exploit.** Any user holding `grn.approve` in *their own* warehouse can approve a GRN belonging to *any* warehouse — which posts real stock movements into a warehouse they have no relationship with. Same shape on `/deliveries/:id/ship`, `/counts/:id/post`, `/transfers/:id/receive`.

This is the most damaging finding: it's not read-only, it mutates the ledger, and `stock_movements` is append-only by design, so the damage isn't cleanly reversible.

**Fix.** Load the document, compare `doc.WarehouseID` against the context warehouse, `403` on mismatch — before any state transition. This belongs in a shared guard, not copy-pasted into each usecase:

```go
func (u *ReceiptUsecase) Approve(ctx context.Context, id, approverID int64) error {
    doc, lines, err := u.docs.GetByID(ctx, id)
    if err != nil { return err }
    if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil { return err }
    ...
```

---

### C-03 — IDOR on document detail
`internal/delivery/http/handler/query.go:73`

```go
func (h *QueryHandler) GetDocumentDetail(c echo.Context) error {
    id, ok := pathIDParam(c, "id")
    doc, err := h.uc.GetDocumentDetail(c.Request().Context(), id)   // no warehouse filter
```

Any authenticated user with `stock.read` in any single warehouse can enumerate `/api/v1/documents/{1..n}` and read every document in the system — quantities, partners, prices, batch data. Same for `GET /counts/:id`.

**Fix.** Push the warehouse into the query predicate, not a post-hoc check: `WHERE id = $1 AND warehouse_id = $2`. Return 404 rather than 403 so the endpoint doesn't confirm existence.

---

### C-04 — Query parameters override the enforced header
`internal/delivery/http/handler/query.go:32-54`

```go
func warehouseCode(c echo.Context) string {
    if code := c.QueryParam("warehouse_code"); code != "" {
        return code           // ← client-supplied value wins over the enforced header
    }
    return c.Request().Header.Get("X-Warehouse-Id")
}
```

And in `ListDocuments`:

```go
f := query.DocumentFilter{ ..., WarehouseID: 0 }        // 0 == all warehouses
if whStr := c.QueryParam("warehouse_id"); whStr != "" { ... }
```

Two bypasses in one function. `?warehouse_code=WH99` overrides the header the middleware just validated. And **omitting `warehouse_id` entirely defaults to `0`, which means no filter** — so the *default* behaviour of `GET /api/v1/documents` is to return documents from every warehouse.

**Fix.** Query params may *narrow* within the authorized warehouse; they must never widen. Default must be the context warehouse, never `0`. If a genuine cross-warehouse view is needed (regional manager), model it as an explicit permission and intersect the requested set with `claims.Warehouses`.

---

### C-05 — Hardcoded AES-256 key for PII encryption
`internal/usecase/item/item_usecase.go:17`

```go
var AESKey = []byte("this-is-a-very-secret-32byte-key") // 32 bytes AES-256 key
```

Partner contact name and phone are encrypted at rest, and the code cites UU PDP compliance. The key is a literal in a public GitHub repository. The encryption provides no confidentiality against anyone who can read the repo — which is everyone. It also can't be rotated without a migration, and it's a mutable package-level `var` that any code in the process can reassign.

`SECURITY.md` lists this as backlog. Given it's the sole control behind a data-protection claim, it isn't backlog.

**Fix.** Key from env/KMS at startup, fail closed if absent in production. Store a key ID alongside each ciphertext (`v1:<b64>`) so rotation is possible. Bind the record ID as AES-GCM additional authenticated data so ciphertexts can't be swapped between rows:

```go
gcm.Seal(nonce, nonce, plaintext, []byte(fmt.Sprintf("partner:%d", partnerID)))
```

---

### C-06 — Default JWT secret, and a production guard that doesn't guard
`internal/config/config.go`

```go
jwtSecret := getEnv("JWT_SECRET", "super-secret-key")
...
if appEnv == "production" && dbConn == "" {          // dead code: getEnv never returns ""
    return nil, fmt.Errorf("DB_CONN_STRING is required in production env")
}
if appEnv == "production" && len(jwtSecret) < 32 {   // length is not entropy
    return nil, ...
}
```

Three issues. The DB check can never fire, because `getEnv` returns a non-empty default — so a misconfigured production deploy silently connects to `host=localhost user=user password=password`. The JWT check tests length only, so `"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"` passes. And the default secret is a known constant; `vapt.md` already demonstrates minting a `sysadmin` token with it (SEC-01).

**Fix.** No defaults for secrets. `os.LookupEnv` and hard-fail when absent, in every environment — a developer hitting a clear startup error is better than a developer unknowingly running the production default. Require ≥32 bytes of decoded base64 entropy, not 32 characters.

---

### C-07 — Public self-registration grants a real warehouse role
`cmd/api/main.go:150-190`, `router.go` (`POST /api/v1/auth/register` is unauthenticated)

```go
role, err := txQueries.GetRoleByCode(ctx, pgtype.Text{String: "requester", Valid: true})
wh,   err := txQueries.GetWarehouseByCode(ctx, "WH01")
txQueries.AssignUserRole(ctx, ...)
```

Anyone who can reach the API creates an account that is immediately authorized to create requests in `WH01`. Rate-limited to 10/15min per IP — which limits the rate, not the outcome.

Combined with C-01/C-02, a self-registered anonymous user reaches a role that can then act against *other* warehouses.

**Fix.** For an enterprise WMS, remove public registration entirely; users are provisioned by an admin or via SSO/SCIM. If self-service is required, register into a pending state with no role until approved.

---

## 2. High findings

### H-01 — No multi-tenancy exists
Zero occurrences of `tenant`, `org_id`, `company_id`, `organization` across all `.go` and `.sql`. Every table is globally scoped; the only isolation dimension is `warehouse_id`, and per C-01–C-04 that dimension is not enforced in the data layer.

This is a single-tenant application. Treating warehouses as tenants is possible but is a schema and enforcement project, not a config change. See §6.

### H-02 — Rate limiter: permanent lockout, fail-open, spoofable, non-atomic
`internal/delivery/http/middleware/rate_limit.go`

```go
count, err := store.IncrBy(ctx, key, 1)
if err != nil {
    return next(c)              // fail-open
}
_ = store.Expire(ctx, key, window)   // TTL re-armed on EVERY request
if count > maxReqs { ... 429 }
```

Four distinct problems:

1. **Permanent lockout.** Re-arming the TTL on every request means the counter only expires after `window` of *complete silence*. A client that keeps retrying keeps pushing the expiry out and stays blocked forever. `SECURITY.md` claims this design prevents permanent lockout — it is precisely what causes it. Under high traffic a busy legitimate client that trips 100 req/min never recovers.
2. **Fail-open on Redis error.** A Redis outage disables login brute-force protection entirely.
3. **`c.RealIP()` is spoofable.** Echo trusts `X-Forwarded-For` unless `e.IPExtractor` is configured with a trusted-proxy list. It isn't. An attacker rotates the header and gets unlimited login attempts.
4. **Non-atomic** `INCR` + `EXPIRE` (two round trips), and `context.Background()` instead of the request context, so no cancellation.

**Fix.** One Lua script (or `INCR` + `EXPIRE NX`) for a true fixed window, or a sliding window over a sorted set. Fail *closed* on auth endpoints, open elsewhere. Configure `e.IPExtractor = echo.ExtractIPFromXFFHeader(echo.TrustLinkLocal(false), echo.TrustPrivateNet(true))`. Emit `X-RateLimit-*` headers. Key login limits on `(IP, username)` as well as IP.

Also: the comments say 5/15min for login; the code says 25.

### H-03 — Access tokens cannot be revoked
`middleware/auth.go` parses and trusts the token. There is no JTI denylist check. `Logout` only deletes the *refresh* JTI. `roles` and `warehouses` are baked into the access token at issue time.

So for up to 15 minutes after logout, deactivation, role revocation, or warehouse un-assignment, the old token keeps working with the old privileges. For an enterprise system with SoD requirements, a 15-minute window on "revoke this user's access to WH02 immediately" is not acceptable.

**Fix.** Redis denylist keyed on access-token JTI, checked in middleware (one `EXISTS`, ~0.2ms); populate on logout/deactivation. Or a per-user `token_version` counter in the claims, bumped on any privilege change. Fail closed if Redis is unavailable on this path.

### H-04 — Double-approve race double-posts stock
`internal/usecase/inbound/receipt.go:257` + `db/queries` → `UpdateDocumentStatus`

```go
doc, lines, err := u.docs.GetByID(ctx, id)   // read, no lock, outside tx
next, err := doc.Status.Transition(document.StatusApproved)   // check outside tx
return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
    u.posting.PostStockMovementInTx(txCtx, doc.DocNo, inputs)
    return u.docs.UpdateStatus(txCtx, id, next, &approverID)
})
```

```sql
UPDATE doc.documents SET status = $2::doc.doc_status, ... WHERE id = $1
```

No `FOR UPDATE` on the read, no `AND status = <expected>` on the write, and the query is `:exec` so rows-affected is discarded. Two concurrent approvals both read `submitted`, both pass `Transition`, both post movements. **Stock is credited twice.**

Ironic given how carefully `posting.go` handles concurrency — the balance rows are locked correctly, but nothing stops two legitimate-looking postings from being generated.

**Fix.** Compare-and-set inside the transaction, and check the row count:

```sql
-- name: TransitionDocumentStatus :execrows
UPDATE doc.documents SET status = $3, approved_at = NOW(), approved_by = $4
WHERE id = $1 AND status = $2
```

```go
n, err := q.TransitionDocumentStatus(txCtx, ...)
if n == 0 { return apperr.New("ERR_CONFLICT", "document status changed concurrently") }
```

Move `GetByID` inside the transaction with `SELECT ... FOR UPDATE`.

### H-05 — Casbin policies are frozen at startup
`cmd/api/main.go:230-260`; `internal/usecase/admin/admin_usecase.go` contains no enforcer reference at all.

Policies are loaded from `sec.role_permissions × master.warehouses` once during boot. The admin API can create and update roles — and those writes never reach the in-memory enforcer. **Revoking a permission has no effect until every replica restarts.** Under multiple replicas, different pods enforce different policy sets.

There's a second problem: `BuildPolicies` is a cartesian product.

```go
for _, rp := range rolePerms {
    for _, wh := range warehouses {
        out = append(out, []string{rp.RoleCode, wh, obj, act})
    }
}
```

50 roles × 200 permissions × 500 warehouses = 5M policy tuples in RAM per replica, rebuilt on every boot. This does not scale to a tenant-per-warehouse model.

**Fix.** Use Casbin's `pgx` adapter with `SyncedEnforcer` + `EnableAutoNotifyWatcher` (Redis watcher) so policy writes propagate to all replicas within milliseconds. Restructure the model so the domain is a *pattern* rather than an enumerated row — `keyMatch`-style domain matching, or a `g2` grouping of warehouses into domains — so policy count is O(roles × permissions), independent of warehouse count.

### H-06 — `DB_POOL_MAX` is loaded and then ignored
`cmd/api/main.go:73`

```go
pool, err := pgxpool.New(ctx, cfg.DBConnString)   // cfg.DBPoolMax never used
```

`config.Load()` parses and validates `DB_POOL_MAX`; `docker-compose.yml` sets it to 10. It is never applied. pgx defaults to `max(4, NumCPU)`. Your connection pool is not the size you think it is — the single most important capacity knob is silently disconnected.

**Fix.**

```go
poolCfg, err := pgxpool.ParseConfig(cfg.DBConnString)
poolCfg.MaxConns = int32(cfg.DBPoolMax)
poolCfg.MinConns = int32(cfg.DBPoolMin)
poolCfg.MaxConnLifetime = 30 * time.Minute
poolCfg.MaxConnIdleTime = 5 * time.Minute
poolCfg.HealthCheckPeriod = 1 * time.Minute
pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
```

Add a startup log of the effective values. Note `MaxConns × replicas` must stay under Postgres `max_connections`; at high replica counts put PgBouncer in transaction mode in front.

### H-07 — No graceful shutdown
`cmd/api/main.go` ends with a blocking `router.StartServer(srv)` and no signal handling. `defer pool.Close()` and `defer asynqClient.Close()` never execute. On every deploy, rolling restart, or pod eviction, in-flight requests are cut mid-transaction.

**Fix.**

```go
go func() {
    if err := router.StartServer(srv); err != nil && !errors.Is(err, http.ErrServerClosed) { ... }
}()
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()
<-ctx.Done()
shutdownCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
defer cancel()
_ = srv.Shutdown(shutdownCtx)
```

Also flip `/readyz` to unhealthy *before* shutdown begins so the load balancer drains first.

### H-08 — Unbounded list endpoints
`init.sql.go` — `listItems`, `listPartners`, `listLocations`, `listWarehouses`, `listRoles`, `listPermissions`, `listCategories`, `listSettings` have **no `LIMIT`**.

```sql
SELECT id, public_id, sku, name, ... FROM master.items ORDER BY sku
```

```go
func (h *ItemHandler) ListItems(c echo.Context) error {
    items, err := h.uc.ListItems(c.Request().Context())   // everything
```

An enterprise catalog of 500k SKUs means one request materialises 500k rows in Postgres, then in Go, then serialises them to JSON. At 100 req/min per user (the rate limit) this is a trivial memory-exhaustion DoS and it will OOM the pod long before the limiter matters.

The codebase already has a well-built keyset `pagination` package — used by exactly one endpoint (`/stock/movements`).

**Fix.** Mandatory `LIMIT` with a server-side maximum on every `:many` query. Extend the existing keyset cursor to all list endpoints; avoid `OFFSET` for deep pages.

### H-09 — N+1 queries inside open transactions
Two hot paths, both holding row locks while doing per-item round trips.

`repository/postgres/stock.go:94` — `GetBalancesForUpdate` loops per key:

```go
for _, k := range keys {
    q.EnsureBalanceExists(ctx, ...)       // 1 query
    // + SELECT ... FOR UPDATE            // 1 query
}
```

2N round trips for N balance keys, on **every stock posting**.

`usecase/outbound/allocate.go:108` — allocation loops per line, then per candidate:

```go
for i, it := range items {
    candidates, err := u.cands.LockAllocationCandidates(txCtx, it.line.ItemID, doc.WarehouseID)
    for _, cand := range candidates {
        u.cands.UpdateBalanceReserved(txCtx, cand.BalanceID, take)         // 1 query
        u.docs.CreateAllocations(txCtx, []*document.Allocation{alloc})     // 1 query, slice of ONE
    }
}
```

A 50-line delivery with 5 batches per line ≈ 550 round trips inside one transaction. At 1ms RTT that's a **half-second lock hold**, which at high traffic produces lock convoys and pool exhaustion. Note `CreateAllocations` already takes a slice — the batching API exists and isn't used.

**Fix.** Set-based operations with `unnest`:

```sql
-- name: EnsureBalancesExist :exec
INSERT INTO inv.stock_balances (item_id, location_id, batch_id, status, qty_onhand, qty_reserved)
SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::bigint[], $4::inv.stock_status[]), 0, 0
ON CONFLICT (item_id, location_id, COALESCE(batch_id,0), status) DO NOTHING;

-- name: LockBalances :many
SELECT ... FROM inv.stock_balances
WHERE (item_id, location_id, COALESCE(batch_id,0), status) IN (SELECT * FROM unnest(...))
ORDER BY item_id, location_id, COALESCE(batch_id,0), status
FOR UPDATE;
```

Accumulate allocations and flush with one multi-row `INSERT` and one `UPDATE ... FROM unnest(...)`.

### H-10 — Deadlock risk in allocation
`posting.go` sorts balance keys deterministically before locking, with a comment explaining why. `allocate.go` does not — it locks candidates in request-line order. Two concurrent allocations whose lines reference overlapping items in different orders will deadlock.

**Fix.** Sort `items` by `ItemID` before the loop, and add `ORDER BY` to `LockAllocationCandidates`. Better: pre-collect all candidate balance IDs, sort globally, lock once.

### H-11 — Login: timing oracle and Argon2 memory DoS
`handler/auth.go:96`

```go
userID, passwordHash, roles, warehouses, err := h.lookupUser(ctx, req.Username)
if err != nil {
    return response.Error(c, 401, "ERR_UNAUTHENTICATED", "Invalid credentials", ...)  // returns FAST
}
match, err := auth.VerifyPassword(req.Password, passwordHash)                          // ~50-100ms
```

The message is generic — `SECURITY.md` correctly claims that. But an unknown username returns in ~1ms while a known one costs a full Argon2id derivation (64MB, t=3). The timing gap is enormous and trivially measurable: **username enumeration**, generic message notwithstanding.

Second issue: Argon2id at 64MB with no concurrency cap. 200 concurrent logins = 12.8GB. The login limiter is per-IP and fail-open, so a distributed burst OOMs the process.

**Fix.** Always run a verification against a fixed dummy hash when the user isn't found. Gate password hashing behind a weighted semaphore (`golang.org/x/sync/semaphore`) sized from available memory, returning 503 when saturated. Add per-account lockout with exponential backoff on top of the IP limit.

### H-12 — Audit trail covers admin CRUD only
`InsertAuditLog` is called from `admin_usecase.go` (user/role/settings) and one transfer-discrepancy event. It is **not** called for GRN approval, delivery shipment, stock posting, count posting, adjustments, or allocation overrides — the operations that change inventory value. Login/logout aren't audited either (acknowledged as backlog in `SECURITY.md`).

For a WMS with maker-checker and SoD requirements, "who moved this stock and when" is the core audit question, and it isn't answered.

**Fix.** Write the audit row inside the same transaction as the state change (not after — an audit log that can be lost while the change commits is worse than none). Capture actor, action, entity, before/after, request ID, IP. Consider a generic trigger on `doc.documents` status changes as defence in depth.

---

## 3. Medium findings

**M-01 — Idempotency middleware is dead code.** `middleware/idempotency.go` defines `IdempotencyFilter()`; it is never registered in `router.go`. Idempotency relies on the `documents.idempotency_key` UNIQUE column, is *optional* (only if the client sends a key), and covers creates only. `POST /receipts/:id/approve`, `/ship`, `/post` have no replay protection at all — a client retry after a gateway timeout double-posts stock. Combine with H-04 and this is a live inventory-integrity risk. Fix: require `Idempotency-Key` on all state-changing POSTs; cache `(key → status, body)` in Redis; return the cached response on replay.

**M-02 — Refresh cookie survives logout.** `setAuthCookies` writes the refresh cookie with `Path: "/api/v1/auth"`; `clearAuthCookies` expires both with `Path: "/"`. Cookie identity includes path, so the refresh cookie is never cleared and persists in the browser for 7 days. Related: `Refresh` and `Logout` read the token only from the JSON body (`dto.RefreshRequest`, `validate:"required"`) and never from the cookie — so the cookie flow the code sets up is unusable end to end.

**M-03 — No refresh-token reuse detection.** Rotation is implemented, but replaying a consumed token just returns 401. Standard practice is to treat reuse as compromise and revoke the entire token family. Fix: store a family ID; on reuse, delete all `refresh:<userID>:*`.

**M-04 — Authorization fails open when misconfigured.** `router.go`:

```go
func rbacMW(c RouterConfig, resource, action string) []echo.MiddlewareFunc {
    if c.Enforcer == nil { return nil }   // routes register with NO authorization
```

Convenient for tests, dangerous in production: a nil enforcer yields a fully-functional API with authorization silently removed. Fix: panic at startup if `AppEnv != "test"` and the enforcer is nil.

**M-05 — Redis client is unconfigured.** `redis.NewClient(&redis.Options{Addr: addr})` — no `Username`/`Password`, no `TLSConfig`, no `PoolSize`, no `ReadTimeout`/`WriteTimeout`, no `MaxRetries`, no Sentinel/Cluster support. `docker-compose.yml` runs Redis with no auth and publishes 6379 to the host. Redis holds refresh sessions and rate-limit state.

**M-06 — Missing indexes on the scoping column.** `doc.documents` has one index: `(doc_type, status, doc_date DESC)`. There is **no index on `warehouse_id`** — the column that should lead every query in a warehouse-scoped system. Unindexed FKs: `documents.partner_id`, `documents.ref_doc_id`, `documents.created_by`, `document_lines.item_id`. Fix: `CREATE INDEX CONCURRENTLY idx_doc_wh_type_status ON doc.documents (warehouse_id, doc_type, status, doc_date DESC);` and index every FK.

**M-07 — Partitioning has no partitions.** `stock_movements` is `PARTITION BY RANGE (moved_at)` but migration 000001 creates only `stock_movements_default`. Every row lands in the default partition, so partition pruning never happens and detaching old data requires rewriting the default. A `partition.maintain` job is registered in the worker but the migration ships no monthly partitions. Fix: pre-create rolling monthly partitions; verify the maintenance job actually creates ahead of time; consider `pg_partman`.

**M-08 — Worker scheduler duplicates under replication.** `cmd/worker/main.go` calls `scheduler.Start()` unconditionally. asynq's scheduler has no leader election, so N worker replicas enqueue N copies of every cron job — N expiry alert batches, N reorder calculations, N ledger reconciliations. Fix: split the scheduler into its own single-replica deployment, or add a Redis leader lock. Separately, `Location: nil` means UTC, but the comment says local server time — cron jobs will fire at the wrong wall-clock hour for WIB. And the queue weights `{"default": 10, "critical": 5}` give *lower* priority to critical.

**M-09 — `/metrics` and Swagger UI are public.** `e.GET("/metrics", ...)` and `registerOpenAPI(e, v1)` sit outside the auth group. Prometheus metrics expose route inventory, traffic volume, error rates, and DB pool state; the OpenAPI spec hands an attacker the full API surface. Fix: bind `/metrics` to an internal port or require auth; gate Swagger on non-production.

**M-10 — Compose is a development artifact.** Secrets inline (`JWT_SECRET`, DB password), `sslmode=disable` between API and Postgres, Redis unauthenticated, 5432 and 6379 published to the host, `APP_ENV=development` (which disables the production config guards and HSTS), no `deploy.resources` limits, no log rotation, and fixed `container_name` values that make `--scale` fail. Fine for local dev; make it unmistakably not the deployment path.

**M-11 — Decryption failures leak ciphertext to clients.**

```go
if decName, err := crypto.Decrypt(partners[i].ContactName.String, AESKey); err == nil {
    partners[i].ContactName.String = decName
}
```

On failure — wrong key, key rotation, corrupted row — the error is swallowed and the base64 ciphertext is returned to the client as if it were the contact name. Silent data corruption. Fix: return an error, or a redacted placeholder, and log at ERROR.

**M-12 — 37MB `api.exe` committed.** A Windows build artifact is in git. `.dockerignore` excludes `*.exe` from the build context, but there is **no `.gitignore` at repo root** (the file is empty/absent). Bloats every clone; risks committing further binaries.

**M-13 — No request-scoped timeouts.** `http.Server` sets `WriteTimeout: 30s`, but that does not cancel the request context, so a slow query keeps running against the pool after the client is gone. Fix: `middleware.ContextTimeout` or an explicit `context.WithTimeout` per handler, so cancellation propagates to pgx.

**M-14 — Seeded credentials in migrations.** Migration 000002 creates `admin` / `Admin@123456`; migration 000003 creates eight demo accounts all with `Simbar@123456`. These are documented as dev-only in `SECURITY.md`, but they're in the same migration chain that runs in production. Fix: move demo seeds into a separate, explicitly-invoked seed target; force a password change on first login for `admin`.

---

## 4. Clean code observations

The codebase is disciplined overall — consistent error wrapping via `apperr`, a clean response envelope, sensible domain types, and `doc.go` files documenting package intent. What follows is minor by comparison.

**Documentation contradicts code in several places.** This matters more than usual because `SECURITY.md` is written as an assurance artifact:

| Claim | Reality |
|---|---|
| `SECURITY.md` A04: "window rate-limit di-refresh tiap request sehingga tidak ada lockout permanen" | Re-arming on every request is what *causes* permanent lockout (H-02) |
| `SECURITY.md` A07: "pesan login generik (tanpa enumerasi)" | Message is generic; timing is not (H-11) |
| `SECURITY.md` A01: warehouse membership check "cegah eskalasi lintas gudang" | The check is real but the value is discarded downstream (C-01–C-04) |
| `rate_limit.go`: "login 5/15 mnt" | Code says 25 |
| `redis.go`: `IncrBy` "sets TTL only on creation" | It sets no TTL at all |
| `worker/main.go`: `Location: nil` "timezone lokal server" | asynq treats nil as UTC |

Fix the code where the doc describes the right behaviour; fix the doc where the code is right. A security document that overstates coverage is worse than no document — it stops people looking.

**`RouterConfig` as a variadic with nil-checks.** `NewRouter(cfg ...RouterConfig)` accepts zero or more configs, then guards every section with `if len(cfg) > 0 && cfg[0].X != nil`. This makes the router a 380-line function where features are enabled by non-nil pointers, and it's the root of M-04's fail-open. Take a single required struct; use explicit test constructors for partial wiring; split route registration per module (`registerInboundRoutes(g, deps)`).

**Permission model drift**, self-documented in comments: categories guarded by `item.read` "no category.* permission exists in the RBAC seed"; `GET /users`, `/roles`, `/permissions` guarded by `audit.read` — so anyone who can read audit logs can enumerate all users. Resource/action pairs should be generated from the same source as the seed so drift is a compile error.

**Minor:** package-level mutable `var AESKey`; sqlc's `Column2 interface{}` in `UpdateDocumentStatusParams` (name the parameter in the query); OpenTelemetry is in `go.sum` but no tracing is wired despite `otelhttp` being available — for high-traffic debugging, distributed tracing is worth more than most of the metrics already present; comments mix Indonesian and English within the same package (pick one for a team that may grow).

---

## 5. What's genuinely well done

Worth stating explicitly, because it's what makes the rest fixable:

- **Deterministic lock ordering** in `posting.go`, with `EnsureBalanceExists` before `FOR UPDATE` so new balances are actually locked — and a 50-goroutine concurrency test covering it. That's a subtle bug class, correctly handled.
- **Argon2id** with sound parameters and `subtle.ConstantTimeCompare`.
- **Fully parameterised SQL** through sqlc; no string concatenation anywhere in the repository layer.
- **JWT algorithm pinned** to HMAC in the keyfunc, blocking `alg: none` and RS→HS confusion.
- **Maker-checker enforced twice** — domain function and DB `CHECK` constraint.
- **Append-only ledger** enforced by DB rules, not convention.
- **Refresh JTIs stored as SHA-256**, not raw.
- **Dockerfile**: multi-stage, `CGO_ENABLED=0`, non-root UID 10001, healthcheck, `-trimpath`.
- **Health probes** split into liveness and readiness with per-dependency checks.
- **Keyset pagination package** — the right primitive, just under-applied.
- **A real VAPT document** with reproducible curl steps. Many teams ship nothing.

---

## 6. Roadmap to enterprise multi-tenant, high traffic

### Phase 0 — Stop the bleeding (1–2 weeks)
Close C-01 through C-07. Concretely: resolve warehouse in middleware into request context; delete `warehouse_id` from all request DTOs; add `AssertDocInWarehouse` to every usecase that loads a document by ID; make query params narrow-only; secrets from env with hard-fail; remove public registration. Add integration tests that assert 403/404 for every cross-warehouse access path — one test per endpoint, driven by a table, so new endpoints can't regress silently.

### Phase 1 — Correctness under concurrency (1–2 weeks)
H-04 (status CAS), M-01 (idempotency on all state-changing POSTs), H-10 (lock ordering in allocation), H-12 (audit rows in-transaction). These are what stand between you and a stock ledger you can't reconcile.

### Phase 2 — Introduce tenancy (3–5 weeks)
The decision to make first: **shared schema with a `tenant_id` column, or schema-per-tenant.** For a WMS with a moderate tenant count (tens to low hundreds) and strict isolation expectations, schema-per-tenant is defensible and gives hard isolation with simple per-tenant restore. Beyond that, shared-schema with Postgres Row-Level Security scales better operationally.

If shared schema:

1. `tenant_id BIGINT NOT NULL` on every business table; `warehouse_id` becomes a scope *within* a tenant.
2. Every unique constraint becomes tenant-scoped: `UNIQUE (tenant_id, doc_no)`, `UNIQUE (tenant_id, sku)`. Global uniques are the classic multi-tenant migration bug.
3. Every index leads with `tenant_id`.
4. **Enforce with RLS, not application code** — this is the lesson from C-01 through C-04. A forgotten `WHERE` clause becomes a non-event:

```sql
ALTER TABLE doc.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc.documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON doc.documents
  USING (tenant_id = current_setting('app.tenant_id')::bigint);
```

Set `app.tenant_id` on connection acquisition via `pgxpool.Config.AfterAcquire` (and reset in `BeforeAcquire` — pooled connections carry session state between requests, which is its own leak vector if you skip the reset).

5. Tenant in the JWT claim, never in a header the client controls.
6. Cache keys, Redis keys, asynq task payloads, and idempotency keys all become tenant-prefixed. Cross-tenant cache leakage is the most-missed vector once the SQL side is fixed.
7. Per-tenant rate limits and connection quotas so one tenant can't starve the rest.

### Phase 3 — Scale-out (2–4 weeks)
H-06 (pool config + PgBouncer transaction mode), H-07 (graceful shutdown + readiness draining), H-05 (Casbin pgx adapter + Redis watcher + non-cartesian policy model), H-08 (pagination everywhere), H-09 (set-based queries), M-08 (singleton scheduler), M-07 (real partitions), M-13 (request timeouts). Wire OpenTelemetry — the dependencies are already there.

### Phase 4 — Enterprise controls (ongoing)
SSO/OIDC with SCIM provisioning (which retires C-07 permanently); MFA for approver roles; H-03 (revocable access tokens); KMS-backed key management with rotation (C-05); complete audit coverage with tamper-evident storage; per-tenant data export and deletion for UU PDP; `govulncheck` and Trivy in CI; load testing at target concurrency before, not after.

---

## Appendix — Findings index

| ID | Severity | Finding | Primary location |
|---|---|---|---|
| C-01 | Critical | Cross-warehouse write via body `warehouse_id` | `handler/{receipt,outbound,transfer,counting,item}.go` |
| C-02 | Critical | Cross-warehouse approve / stock post | `usecase/inbound/receipt.go:257` + peers |
| C-03 | Critical | IDOR on document detail | `handler/query.go:73` |
| C-04 | Critical | Query params override enforced header | `handler/query.go:32-54` |
| C-05 | Critical | Hardcoded AES-256 key for PII | `usecase/item/item_usecase.go:17` |
| C-06 | Critical | Default JWT secret; dead prod guard | `config/config.go` |
| C-07 | Critical | Public registration grants WH01 role | `cmd/api/main.go:150` |
| H-01 | High | No multi-tenancy exists | codebase-wide |
| H-02 | High | Rate limiter: lockout, fail-open, spoofable | `middleware/rate_limit.go` |
| H-03 | High | Access tokens not revocable | `middleware/auth.go` |
| H-04 | High | Double-approve race double-posts stock | `usecase/*/`, `UpdateDocumentStatus` |
| H-05 | High | Casbin policies frozen; cartesian blowup | `cmd/api/main.go:230`, `pkg/auth/rbac.go` |
| H-06 | High | `DB_POOL_MAX` ignored | `cmd/api/main.go:73` |
| H-07 | High | No graceful shutdown | `cmd/api/main.go` |
| H-08 | High | Unbounded list endpoints | `init.sql.go`, `handler/item.go` |
| H-09 | High | N+1 inside transactions | `stock.go:94`, `allocate.go:108` |
| H-10 | High | Deadlock risk in allocation | `usecase/outbound/allocate.go` |
| H-11 | High | Login timing oracle; Argon2 DoS | `handler/auth.go:96` |
| H-12 | High | Audit trail covers admin CRUD only | `usecase/*/` |
| M-01 | Medium | Idempotency middleware unwired | `middleware/idempotency.go` |
| M-02 | Medium | Refresh cookie survives logout | `handler/auth.go` |
| M-03 | Medium | No refresh reuse detection | `handler/auth.go` |
| M-04 | Medium | Authorization fails open if enforcer nil | `router.go` |
| M-05 | Medium | Redis unconfigured (auth/TLS/pool) | `pkg/redis/redis.go` |
| M-06 | Medium | No index on `documents.warehouse_id`; unindexed FKs | `000001_init.up.sql` |
| M-07 | Medium | Partitioning has only a default partition | `000001_init.up.sql:206` |
| M-08 | Medium | Scheduler duplicates per worker replica | `cmd/worker/main.go` |
| M-09 | Medium | `/metrics` and Swagger public | `router.go` |
| M-10 | Medium | Compose secrets, no TLS, no limits | `docker-compose.yml` |
| M-11 | Medium | Decrypt failure returns ciphertext | `usecase/item/item_usecase.go:365` |
| M-12 | Medium | 37MB `api.exe` committed; no root `.gitignore` | repo root |
| M-13 | Medium | No request-scoped timeouts | `cmd/api/main.go` |
| M-14 | Medium | Seeded default credentials in migrations | `000002`, `000003` |
