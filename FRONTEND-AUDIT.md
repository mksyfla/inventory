# Frontend Audit — `mksyfla/inventory` (SIMBAR SPA)

**Scope:** `frontend/` — React 19, TypeScript 5.7, Vite 6, Ant Design 5, TanStack Query 5, Zustand 5, React Hook Form + Zod, Dexie, Axios.
**Size:** ~21,200 LOC production, ~6,500 LOC test across 60 test files.
**Lens:** enterprise multi-tenant, high traffic; security; clean code.
**Method:** static review (no npm install / build in the audit sandbox — nothing was compiled or executed).

Companion to `BACKEND-AUDIT.md`. Several findings here are the client-side half of backend findings and are cross-referenced.

---

## 0. Executive summary

The engineering quality is uneven in an unusual way: the *infrastructure* code is genuinely strong, and the *state that infrastructure operates on* is still demo scaffolding.

On the strong side — TypeScript `strict` with `noUnusedLocals`/`noUnusedParameters`, a properly-implemented refresh-token mutex with a queued retry (the thing most teams get wrong), deep recursive redaction of sensitive keys in request logging, no tokens in `localStorage`, no `dangerouslySetInnerHTML` anywhere, Zod schemas on every form, and 60 test files covering pages, hooks, and schemas. That's a real test suite, not decoration.

On the other side, three things ship to production that shouldn't leave a laptop:

1. **The auth store initialises as an authenticated sysadmin.** `isAuthenticated: true`, `user: MOCK_CURRENT_USER` with roles `['manager','sysadmin']`, and a hardcoded `"mock-jwt-token-xyz-12345"`. The app boots fully authorised without anyone logging in.
2. **The login form ships with the seeded admin password pre-filled** — `admin` / `Admin@123456`, matching backend migration `000002`.
3. **Offline sync is a `setTimeout` that reports success without sending anything.** The IndexedDB queue is written to and never drained.

Number 3 is the one I'd escalate first. It isn't a vulnerability in the classical sense — it's a UI that tells a warehouse operator *"Seluruh draf transaksi offline berhasil terkirim ke server"* when zero bytes left the device. Silent data loss with an affirmative confirmation is worse than a visible failure, and on handheld scanners in dead zones it is the expected path, not the edge case.

**Counts:** 5 Critical · 8 High · 12 Medium · assorted Low.

---

## 1. Critical findings

### F-C-01 — Auth store boots as an authenticated sysadmin
`src/store/useAuthStore.ts:24-28`

```ts
export const useAuthStore = create<AuthState>((set, get) => ({
    user: MOCK_CURRENT_USER,              // roles: ['manager', 'sysadmin']
    token: "mock-jwt-token-xyz-12345",
    refreshToken: "mock-refresh-token-xyz-99999",
    isAuthenticated: true,                 // ← default is "logged in"
```

`ProtectedRoute` gates on exactly this flag:

```ts
if (!isAuthenticated) return <Navigate to="/login" ... />;
```

So the guard passes for everyone, always. `MOCK_CURRENT_USER` carries `sysadmin`, and `hasPermission` short-circuits to `true` for that role — meaning `PermissionGuard` opens every admin screen too.

Two consequences worth separating:

- **Anyone reaching the URL gets the full application shell** — navigation, admin pages, forms, screen structure, field names, business logic in the client bundle. API calls fail with 401, so no server data leaks, but the entire internal application surface is browsable by an unauthenticated visitor. That is a meaningful reconnaissance gift, and it looks like a broken product.
- **Every page refresh silently re-authenticates as the mock sysadmin.** State is in-memory only (see F-H-02), so F5 discards the real session and restores the mock. The user briefly sees a fully-privileged UI as themselves-but-not, until the first API call 401s and forces logout.

**Fix.** Initial state must be logged out, and the guard must verify a real token, not a boolean:

```ts
export const useAuthStore = create<AuthState>()(persist((set, get) => ({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    ...
})));
```

```ts
// ProtectedRoute
const { token } = useAuthStore();
const claims = token ? decodeJwtPayload(token) : null;
const valid = claims?.exp ? claims.exp * 1000 > Date.now() : false;
if (!valid) return <Navigate to="/login" state={{ from: location }} replace />;
```

Then delete `MOCK_CURRENT_USER` and the other 25 `MOCK_*` exports from `src/types/` so this can't regress. A grep-able ban in CI (`grep -r "MOCK_" src --include="*.tsx" | grep -v __tests__`) costs nothing.

---

### F-C-02 — Admin credentials pre-filled in the login form
`src/pages/LoginPage.tsx:39-43`

```ts
defaultValues: {
    username: "admin",
    password: "Admin@123456",
    rememberMe: true,
},
```

These are the exact credentials seeded by backend migration `000002`, which runs in the same migration chain as production. The form ships them in the JS bundle and pre-fills them, so the login screen is effectively a one-click admin login on any deployment where the default password hasn't been rotated.

This also pairs with backend M-14 (seeded credentials) to turn two "dev convenience" items into a working authentication bypass.

**Fix.** Empty `defaultValues`. If a dev convenience is wanted, gate it: `...(import.meta.env.DEV ? { username: "admin" } : {})` — and never the password.

---

### F-C-03 — Offline sync is simulated; the queue is never drained
`src/components/common/OfflineSyncBanner.tsx:38-48`

```ts
const triggerSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
        setPendingQueueCount(0);
        setIsSyncing(false);
        notification.success({
            message: 'Sinkronisasi Data Selesai (FE-902)',
            description: 'Seluruh draf transaksi offline berhasil terkirim ke server.',
        });
    }, 1500);
};
```

No network call. No Dexie read. `pendingQueueCount` starts at 0 and is never populated from the database. The success message asserts that every offline draft reached the server.

Meanwhile `useOfflineDraft.ts` genuinely *writes* to the queue:

```ts
const idempotencyKey = customIdempotencyKey || generateUUID();
return await offlineDb.syncQueue.add({ idempotencyKey, endpoint, method, payload, status: 'pending', ... });
```

A repo-wide grep for `syncQueue` outside tests returns exactly two call sites: `add` and a `where('status').equals('pending').toArray()` reader. Nothing transitions an item to `syncing`, `completed`, or `failed`. Nothing posts. There's also no service worker or PWA manifest anywhere in the project, so the app can't even load while offline.

**Impact.** A picker completes a count in a cold-storage aisle with no signal. The drafts land in IndexedDB. They reconnect, see a green "sync complete" toast, and close the tab. The transactions are gone — and the operator has been told they aren't.

**Fix.** Implement the drain, with the queue as the source of truth for the badge count:

```ts
async function drainQueue() {
    const pending = await offlineDb.syncQueue.where('status').equals('pending').toArray();
    for (const item of pending) {
        await offlineDb.syncQueue.update(item.id!, { status: 'syncing' });
        try {
            await apiClient.request({
                url: item.endpoint,
                method: item.method,
                data: item.payload,
                headers: { 'Idempotency-Key': item.idempotencyKey },   // stable key — see F-H-01
            });
            await offlineDb.syncQueue.update(item.id!, { status: 'completed' });
        } catch (err) {
            const retryCount = item.retryCount + 1;
            await offlineDb.syncQueue.update(item.id!, {
                status: retryCount >= MAX_RETRIES ? 'failed' : 'pending',
                retryCount,
            });
        }
    }
}
```

Report actual counts, surface `failed` items in a UI the operator can act on, and never show success unless every item completed. The stored `idempotencyKey` is the right design — it's what makes replay safe once backend M-01 is fixed. Until the drain exists, remove the success notification: an honest "offline drafts pending" badge is strictly better than a false confirmation.

---

### F-C-04 — Warehouse IDs are fabricated on the client
`src/store/useWarehouseStore.ts:29-45`

```ts
// Seed the store from JWT `warehouses` claims (backend warehouse codes, e.g. "WH01").
setWarehousesFromCodes: (codes: string[]) => {
    const warehouses: Warehouse[] = clean.map((code, idx) => ({
        id: idx + 1,            // ← invented primary key
        code, name: code, address: '', isActive: true,
    }));
```

The JWT carries warehouse *codes*. The store invents numeric IDs by array position. Those invented IDs then go into request bodies as real foreign keys:

```ts
// LocationsPage.tsx:68
warehouse_id: activeWarehouseId,
```

**Exploit-free but corrupting.** A user assigned only to `WH02` (real database ID 2) gets a synthesized `id: 1`. Every document they create is submitted with `warehouse_id: 1` — a different warehouse. Because backend C-01 doesn't validate the body warehouse against the caller's assignment, the backend accepts it. Two independent bugs cancel out the safety net on both sides and the result is silently misfiled inventory.

Two form pages make it worse with hardcoded defaults: `RequestFormPage.tsx:76` and `AdjustmentFormPage.tsx:47` both start at `warehouseId: 1`.

The comment explaining the workaround is stale:

```ts
// Seed warehouse store from JWT warehouse codes (backend has no /warehouses endpoint).
```

The backend *does* expose `GET /api/v1/warehouses`, and `src/api/services/warehouses.ts` already calls it — `StockBalancesPage` uses it today. The workaround is unnecessary.

**Fix.** Fetch real warehouses after login and intersect with the JWT codes:

```ts
const all = await warehouseService.list();
const allowed = all.filter(w => claims.warehouses.includes(w.code));
useWarehouseStore.getState().setWarehouses(allowed);
```

Remove hardcoded `warehouseId: 1` defaults; require an explicit selection. Once backend C-01 is fixed and `warehouse_id` is dropped from the request DTOs, this class of bug disappears entirely — which is the better long-term answer.

---

### F-C-05 — No security headers on the SPA document
`frontend/nginx.conf`

The nginx config that serves the application sets **no** security headers. Not CSP, not `X-Frame-Options`, not `X-Content-Type-Options`, not `Referrer-Policy`, not HSTS.

The backend does set a full header suite — but only on `/api/*` JSON responses. `Content-Security-Policy: default-src 'self'` on a JSON payload does nothing; CSP is enforced in the *document* context. The document is `index.html`, served by nginx, bare.

So the application has no clickjacking protection, no MIME-sniffing protection, and no CSP — meaning any XSS that does appear has no second line of defence, and the app can be framed for UI-redress attacks against approval buttons. In a WMS where a click approves a goods receipt, that matters.

**Fix.**

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

Note `camera=(self)` — `CameraScannerModal` uses `getUserMedia` via `@zxing/browser`, so a blanket `camera=()` would break barcode scanning. Ant Design injects runtime styles, hence `'unsafe-inline'` for `style-src`; that's acceptable, `script-src` is the one that must stay strict. Removing the Google Fonts `<link>` (F-M-05) is what lets you keep `default-src 'self'` clean.

---

## 2. High findings

### F-H-01 — Idempotency keys are regenerated per request, defeating idempotency
`src/api/client.ts:186-192`

```ts
if (method && ["POST","PUT","PATCH","DELETE"].includes(method)) {
    if (!customConfig.headers["Idempotency-Key"]) {
        customConfig.headers["Idempotency-Key"] = generateUUID();   // new UUID every call
    }
}
```

An idempotency key must be stable for a *logical operation* so a retry is recognised as the same operation. Generating a fresh UUID per HTTP call means every retry looks new, and the server dutifully creates a second document.

The automatic post-refresh retry happens to be safe — `apiClient(originalRequest)` reuses headers that already carry a key. The dangerous path is the human one: a submit times out, the operator clicks again, a new UUID is minted, and a duplicate goods receipt is created. This is precisely the scenario `documents.idempotency_key` exists to prevent, defeated at the client.

**Fix.** Mint the key once per user action, in the mutation, and reuse it across retries:

```ts
const idempotencyKey = useMemo(() => generateUUID(), [formSessionId]);
mutate({ ...values }, { headers: { 'Idempotency-Key': idempotencyKey } });
```

Remove the blanket interceptor default, or have it only fill in for genuinely one-shot calls. `useOfflineDraft` already does this correctly by persisting the key — mirror that pattern online.

### F-H-02 — Session is in-memory only; `rememberMe` is dead
Zustand store with no `persist` middleware. Closing or refreshing the tab discards the token — and because of F-C-01, lands on the mock identity rather than a login screen.

`LoginPage` collects `rememberMe: true` and nothing ever reads it.

**Fix.** For a Bearer-token SPA, `sessionStorage` via `zustand/middleware`'s `persist` is a reasonable balance (survives refresh, dies with the tab, `rememberMe` switches to `localStorage`). The stronger option is to drop client-held tokens entirely and use the HttpOnly cookies the backend already sets — though backend M-02 must be fixed first, since the refresh/logout endpoints currently read the token only from the JSON body and never from the cookie.

Rehydrate by validating `exp` on boot and calling `/auth/refresh` if the access token is stale, so a returning user resumes rather than being bounced to login.

### F-H-03 — Token refresh preserves stale identity
`src/api/client.ts:283-287`

```ts
const currentUser = useAuthStore.getState().user;
if (currentUser) {
    useAuthStore.getState().login(currentUser, newToken, newRefreshToken);   // old user object
}
```

The refresh response contains a new access token with fresh `roles` and `warehouses` claims. The client throws those away and re-attaches the *previous* user object. `setSession` — which correctly decodes claims and re-seeds the warehouse store — exists and isn't used here.

So role and warehouse changes never propagate through refresh. A user removed from `WH02` keeps `WH02` in their client-side warehouse switcher indefinitely, sends `X-Warehouse-Id: WH02`, and gets 403s that look like bugs. Combined with backend H-03 (irrevocable access tokens), privilege changes have no reliable client-side propagation path at all.

**Fix.** `useAuthStore.getState().setSession(newToken, newRefreshToken);` — one line, and it re-derives everything from the new claims. Reconcile the active warehouse afterwards: if the current selection is no longer in the claims, fall back to the first allowed one and tell the user.

### F-H-04 — Permission model duplicated on the client and drifting
`src/types/user.ts` — `ROLE_PERMISSIONS`, `permissionsFromRoles`, `ALL_PERMISSION_CODES`

The frontend maintains its own copy of the role→permission mapping, hand-maintained against the backend's `sec.role_permissions` seed. Two sources of truth for authorization, updated independently. When they diverge the UI shows actions the API will reject, or hides actions the user is entitled to.

`hasPermission` adds a hardcoded escape hatch:

```ts
if (user.roles.includes("sysadmin") || (user.roles as string[]).includes("inventory_manager")) {
    return true;
}
```

Note the `as string[]` cast — `inventory_manager` isn't in the `UserRole` union, so the type system was overridden to add it. That's a signal the role vocabulary drifted between client and server. The backend audit found the mirror image: routes guarded by borrowed permissions (`/categories` under `item.read`, `/users` under `audit.read`) because the seed lacked the right codes.

**Fix.** Have the backend return the effective permission list (in the JWT claims or a `GET /me` endpoint) and treat it as opaque on the client. If the mapping must stay client-side, generate `ROLE_PERMISSIONS` from the same seed file the migration uses, so drift becomes a build failure.

Worth stating plainly: client-side permission checks are UX, never security. Everything they gate must be enforced server-side — which is exactly what backend C-01/C-02 fail to do.

### F-H-05 — Fetch-everything, filter-in-browser
Consistent across every list page. `StockBalancesPage.tsx:69-88`:

```ts
const { data: balances = [] } = useQuery({ queryFn: () => stockService.balances() });  // no params
const filteredBalances = useMemo(() => balances.filter(item => { /* 4 predicates */ }), [...]);
const totalOnHand = balances.reduce((acc, b) => acc + b.qtyOnHand, 0);
```

`ItemsPage.tsx` is the same shape: fetch all items, `items.filter(...)`, then hand the full array to `<Table pagination={{ pageSize: 10 }} />`. Ant Design paginates the rendered rows; the network transfer, the JSON parse, and the React state all carry the complete dataset.

This is the client half of backend H-08 (unbounded `SELECT ... ORDER BY sku` with no `LIMIT`). At enterprise scale — 500k SKUs, millions of balance rows — the tab runs out of memory before the table renders. The search box has no debounce on the query either, so every keystroke re-runs a filter across the entire array.

**Fix.** Server-side filtering and pagination together with backend H-08. The pieces already exist: `useDebouncedSearch` is written and used only for typeahead, and the backend has a keyset `pagination` package used by exactly one endpoint. Push `search`, `status`, `category`, `limit`, `cursor` into the query params, put them in the React Query key, and use `keepPreviousData` (already the default here) for smooth paging. For any table that must stay long, add `virtual` on the antd Table.

### F-H-06 — nginx body limit blocks the upload features
`nginx.conf` sets no `client_max_body_size`, so nginx's 1MB default applies. The backend explicitly allows 10MB for `POST /items/import` and `POST /receipts/:id/attachments`:

```go
protected.POST("/items/import", itemHandler.ImportItems, append(rbacMW(...), echoMiddleware.BodyLimit("10M"))...)
```

Any import or attachment over 1MB dies at the proxy with a bare nginx 413 that the SPA's error mapper won't recognise — the user sees a generic failure with no explanation. Item import is a bulk feature; files will exceed 1MB routinely.

**Fix.** `client_max_body_size 12m;` in the `/api/` location (slightly above the backend limit so the backend produces the structured error), and map 413 explicitly in `errorMapper.ts`.

### F-H-07 — The UI is built around the backend's cross-warehouse leak
`StockBalancesPage.tsx:79`

```ts
const matchesWarehouse = selectedWarehouse === 'all' || item.warehouseId === Number(selectedWarehouse);
```

An "all warehouses" option in the filter, over a dataset fetched without warehouse scoping. This only produces useful results because backend C-04 defaults `warehouse_id` to `0` (= no filter). The feature is built on the vulnerability.

This matters for sequencing: fixing backend C-04 will make this screen appear to break. Plan the UI change alongside it — either scope the view to the active warehouse, or introduce an explicit cross-warehouse permission that the backend honours by intersecting with `claims.warehouses`.

### F-H-08 — No linter, no formatter, no CI
No `.eslintrc*`, no `eslint.config.js`, no `.prettierrc`, no `.github/` anywhere in the repository. `package.json` has `build`, `test`, `dev`, `preview` — no `lint`.

83 occurrences of `any` in non-test source, despite `strict: true`. The pattern is telling: `payload: any` in the sync queue, `error: any` in the query client, `location.state as any` in `LoginPage` — the `any`s cluster exactly where types would have caught real bugs.

For a codebase of this size with a real test suite, the absence of automated checks is the gap that lets findings like F-C-01 and F-C-02 survive to a tagged commit.

**Fix.** `typescript-eslint` with `react-hooks` (the exhaustive-deps rule alone will find stale-closure bugs in these `useEffect`s), `jsx-a11y`, and a `no-restricted-imports` rule banning `MOCK_*` from non-test files. Prettier for formatting — the codebase currently mixes 2-space and 4-space indentation across files. Then a CI workflow running `tsc -b`, `eslint`, `vitest run`, and `npm audit`.

---

## 3. Medium findings

**F-M-01 — Offline drafts stored unencrypted with no lifecycle.** `src/db/offlineDb.ts` persists receipts, picking scans, and count lines to IndexedDB in plaintext, with `payload: any` in the sync queue. On shared warehouse handhelds, this is business data readable by anyone with the device or any script running on the origin. No TTL, no cleanup on logout, no size cap — the database grows forever. Fix: purge on logout, expire drafts after N days, and consider Web Crypto encryption with a key derived at login for anything sensitive.

**F-M-02 — `usePaginatedQuery` doesn't paginate.** It appends `activeWarehouseId` to the query key and forwards to `useQuery`. No limit, offset, or cursor anywhere. A name that promises something the function doesn't do is worse than no abstraction — it stops the next developer from looking. Rename to `useWarehouseScopedQuery`, or make it deliver pagination as part of the H-05 fix.

**F-M-03 — Mock categories in production filters.** `InventoryValuationPage.tsx:260` and `FsnAnalysisPage.tsx:233` build category dropdowns from `MOCK_CATEGORIES` while fetching real report data. Users filter by categories that may not exist, and real categories are missing from the list. `ItemFormPage` already fixed this and documents the change in a comment — apply the same fix.

**F-M-04 — nginx hardening gaps beyond headers.** No `server_tokens off` (version disclosure in every response and error page). No explicit `Cache-Control` on `index.html`, so a proxy may serve a stale document referencing hashed asset files that no longer exist after deploy — a white screen that resolves only with a hard refresh. No `limit_req`/`limit_conn` at the edge. Add `location = /index.html { add_header Cache-Control "no-cache"; }`.

**F-M-05 — Google Fonts loaded from a third party.** `index.html` preconnects to `fonts.googleapis.com` and `fonts.gstatic.com`. Every page load leaks user IP and User-Agent to Google — a live GDPR issue in the EU and worth reviewing under UU PDP given the project's stated compliance posture. It also forces CSP to allow third-party origins, and adds a hard external dependency to an application that runs on warehouse floors with unreliable connectivity. Fix: self-host Inter via `@fontsource/inter` — one dependency, faster, and it makes `default-src 'self'` achievable.

**F-M-06 — Fixed 15s timeout, no backoff handling.** `apiClient` sets `timeout: 15000` globally. A 10MB item import over warehouse WiFi will not finish in 15 seconds; the client aborts a request the server is still processing, and with F-H-01 the retry creates a duplicate. Separately, the backend sends `Retry-After` on 429 and the client ignores it, retrying twice on a fixed schedule (`failureCount < 2`) — which, given the backend's lockout bug (H-02), actively deepens the lockout. Fix: per-request timeout overrides for uploads, and honour `Retry-After` with exponential backoff.

**F-M-07 — No code splitting.** `vite.config.ts` has no `build.rollupOptions.manualChunks` and the router imports every page eagerly. Ant Design, `@zxing/library`, Dexie, and 40+ pages compile into one bundle — likely well over 1MB gzipped. On a handheld scanner over 3G that's a slow first paint for a login screen. Fix: `React.lazy` per route (the router is already centralised in `src/routes/router.tsx`, so this is a contained change) and split vendor chunks.

**F-M-08 — Error strings hardcoded in Indonesian in the API layer.** `client.ts` embeds user-facing copy directly: *"Tidak dapat terhubung ke server…"*, *"Sesi Anda telah berakhir."* For an enterprise product likely to need at least English, extracting these later means touching the network layer. Move to a message catalogue keyed by error code now — `errorMapper.ts` is already the right home.

**F-M-09 — Mock warehouse codes don't match the backend.** `MOCK_WAREHOUSES` uses `JKT01`/`BDG01`/`SUB01`; the backend seeds `WH01`/`WH02`. Before `setWarehousesFromCodes` runs, the client sends `X-Warehouse-Id: JKT01` and every request 403s with "Warehouse is not assigned to your account." Resolved by F-C-01/F-C-04, but worth noting as the reason the app fails confusingly on first load rather than cleanly.

**F-M-10 — Stale comment drove a bad workaround.** `useAuthStore.ts:66`: *"backend has no /warehouses endpoint"*. It does, `warehouseService.list()` calls it, and `StockBalancesPage` uses it. An out-of-date comment is the direct cause of F-C-04. Worth a sweep for others — the backend audit found six similar cases where documentation contradicted code.

**F-M-11 — "Offline mode" with no service worker.** The banner announces *"Sistem beralih ke mode penyimpanan lokal IndexedDB Dexie.js"*, but there is no service worker and no PWA manifest. If the operator reloads while offline, the app doesn't load at all — the shell isn't cached. IndexedDB persistence without an offline-capable shell is half a feature. Fix: `vite-plugin-pwa` with a precached shell, alongside the F-C-03 sync implementation.

**F-M-12 — Login password rule contradicts registration.** `loginSchema` uses `z.string().min(6, "Kata sandi minimal 6 karakter")` while the backend requires 12 on registration. Not exploitable — declining to enforce policy at login is correct, since it leaks the rule — but the *message* announces a 6-character minimum that isn't the policy. Use a generic "required" message.

---

## 4. Clean code observations

**Inconsistent formatting.** `client.ts` and `useAuthStore.ts` use 4-space indentation; `ProtectedRoute.tsx`, `useWarehouseStore.ts`, and most pages use 2. Prettier settles this permanently (F-H-08).

**`any` clustered at the boundaries.** All 83 instances sit where external data enters — `error: any` in retry predicates, `payload: any` in the sync queue, `location.state as any`. These are exactly the places where a Zod parse or a discriminated union pays for itself. The codebase already uses Zod extensively for forms; extend it to API response validation and the `any`s largely disappear.

**Dead code.** `rememberMe` collected and never read; `MOCK_*` exports (25 of them) shipped in the production bundle; `pendingQueueCount` state that no code ever increments.

**Mixed-language identifiers and comments.** Indonesian comments in `nginx.conf` and `OfflineSyncBanner`, English in `client.ts` and the hooks, sometimes within one file. Fine for a small co-located team; pick one before the team grows.

**Test-ID discipline is good** — `data-testid` used consistently, which is why the 60-file suite is maintainable. Worth preserving.

**Notable gap in the test suite:** `AuthStore.test.tsx` and `ProtectedRoute.test.tsx` both exist, yet F-C-01 survives. The tests verify the store's *transitions* (login sets state, logout clears it) without asserting its *initial* state. One test — `expect(useAuthStore.getState().isAuthenticated).toBe(false)` on a fresh store — would have caught it. A useful lesson for the suite generally: assert defaults, not just behaviour.

---

## 5. What's genuinely well done

- **Refresh-token mutex with a queued retry** (`client.ts:145-160, 258-275`). Concurrent 401s trigger exactly one `/auth/refresh`; everything else waits on a promise queue and retries with the new token. Refresh rotation is explicitly handled, and `/auth/refresh` is excluded from its own retry path to prevent an infinite loop. This is the single most commonly botched piece of SPA auth and it's correct here.
- **Recursive log redaction** (`redactBody`) masking a sensible key set at any nesting depth, including inside arrays, with `FormData` explicitly flagged rather than naively serialised. `signature_url` is treated as PII — that's a thoughtful call, not a copied list.
- **No tokens in `localStorage`**, no `dangerouslySetInnerHTML`, no `innerHTML`, no `eval` — a clean XSS surface for a 21k-line SPA.
- **TypeScript `strict`** with `noUnusedLocals` and `noUnusedParameters` enabled.
- **60 test files / 6,500 LOC**, covering pages, hooks, and Zod schemas — including a `MakerCheckerSafeguard.test.tsx`, which shows the team is testing business rules and not just rendering.
- **Sensible React Query defaults**: a retry predicate that correctly excludes business errors (`ERR_VALIDATION`, `ERR_SELF_APPROVAL`, `ERR_STOCK_INSUFFICIENT`) from retry, `refetchOnWindowFocus: false`, mutations never retried.
- **Zod + React Hook Form** on every form, with schemas extracted and unit-tested separately.
- **Purpose-built warehouse hardware support** — keyboard-wedge scanner hook, camera scanner via zxing, audio feedback, barcode printing. Somebody understood the operating environment.
- **`ErrorBoundary`**, present and tested.

---

## 6. Recommended sequencing

**Phase 0 — before any deployment (2–4 days)**
F-C-01 (auth defaults to logged out), F-C-02 (remove prefilled credentials), F-C-05 (nginx security headers), and either implement or remove F-C-03's false success notification. Delete all `MOCK_*` from `src/types/` and add the CI grep. These are small, contained changes with outsized impact.

**Phase 1 — correctness (1–2 weeks)**
F-C-04 (real warehouse IDs from the API), F-H-01 (stable idempotency keys), F-H-02 (session persistence), F-H-03 (`setSession` on refresh), F-C-03 proper (implement `drainQueue`), F-H-06 (nginx body limit). Add ESLint + CI (F-H-08) at the start of this phase so the rest lands under checks.

**Phase 2 — scale (2–3 weeks, paired with backend H-08)**
F-H-05 (server-side filtering and pagination) and F-H-07 (warehouse-scoped views) must ship *with* the backend change or the screens break. Add F-M-07 (route-level code splitting) and F-M-06 (timeouts and backoff) alongside.

**Phase 3 — enterprise polish**
F-H-04 (single source of truth for permissions — pairs with backend H-05), F-M-01 (offline data lifecycle), F-M-05 (self-hosted fonts), F-M-11 (real PWA shell), F-M-08 (i18n extraction), plus accessibility review and a bundle budget in CI.

---

## Appendix — Findings index

| ID | Severity | Finding | Primary location |
|---|---|---|---|
| F-C-01 | Critical | Auth store boots as authenticated sysadmin | `store/useAuthStore.ts:24` |
| F-C-02 | Critical | Admin credentials pre-filled in login form | `pages/LoginPage.tsx:39` |
| F-C-03 | Critical | Offline sync simulated; queue never drained | `components/common/OfflineSyncBanner.tsx:38` |
| F-C-04 | Critical | Warehouse IDs fabricated client-side | `store/useWarehouseStore.ts:29` |
| F-C-05 | Critical | No security headers / CSP on SPA document | `nginx.conf` |
| F-H-01 | High | Idempotency key regenerated per request | `api/client.ts:186` |
| F-H-02 | High | No session persistence; `rememberMe` dead | `store/useAuthStore.ts` |
| F-H-03 | High | Refresh preserves stale user identity | `api/client.ts:283` |
| F-H-04 | High | Duplicated, drifting permission model | `types/user.ts` |
| F-H-05 | High | Fetch-all + client-side filter/paginate | all list pages |
| F-H-06 | High | nginx 1MB default blocks 10MB uploads | `nginx.conf` |
| F-H-07 | High | UI depends on cross-warehouse data leak | `pages/stock/StockBalancesPage.tsx:79` |
| F-H-08 | High | No ESLint / Prettier / CI; 83 `any` | repo-wide |
| F-M-01 | Medium | Unencrypted IndexedDB drafts, no lifecycle | `db/offlineDb.ts` |
| F-M-02 | Medium | `usePaginatedQuery` doesn't paginate | `hooks/usePaginatedQuery.ts` |
| F-M-03 | Medium | Mock categories in production filters | `pages/reports/*.tsx` |
| F-M-04 | Medium | nginx: no `server_tokens off`, index cacheable | `nginx.conf` |
| F-M-05 | Medium | Third-party Google Fonts (privacy + CSP) | `index.html` |
| F-M-06 | Medium | Fixed 15s timeout; `Retry-After` ignored | `api/client.ts`, `api/queryClient.ts` |
| F-M-07 | Medium | No code splitting; single large bundle | `vite.config.ts`, `routes/router.tsx` |
| F-M-08 | Medium | Hardcoded Indonesian strings in API layer | `api/client.ts` |
| F-M-09 | Medium | Mock warehouse codes mismatch backend seed | `types/warehouse.ts` |
| F-M-10 | Medium | Stale comment caused the F-C-04 workaround | `store/useAuthStore.ts:66` |
| F-M-11 | Medium | "Offline mode" with no service worker | project-wide |
| F-M-12 | Medium | Login schema min 6 vs backend min 12 | `pages/LoginPage.tsx:15` |
