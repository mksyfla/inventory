# ── Build stage ─────────────────────────────────────────────────────────────
# SIMBAR backend: binary API (cmd/api) dan worker asynq (cmd/worker) dibangun
# dalam satu stage; image runtime memakai keduanya (monolit modular).
FROM golang:1.25-alpine AS build

WORKDIR /src

# Dependency layer caching: hanya go.mod/go.sum yang berubah → layer ini di-reuse.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 → statik binary, bisa jalan di image minimal (alpine) tanpa glibc.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker

# ── Runtime stage ───────────────────────────────────────────────────────────
# alpine + ca-certificates (TLS ke dependensi eksternal bila dipakai) + tzdata
# (pengolahan waktu lokal di doc number/notification). Non-root user.
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 -h /app simbar

WORKDIR /app
COPY --from=build /out/api /out/worker /app/

USER simbar

EXPOSE 8080

# Healthcheck (liveness) — readiness dipantau lewat /readyz di compose.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

# Default: jalankan API. Compose bisa override CMD (mis. /app/worker) —
# memakai CMD (bukan ENTRYPOINT) agar override `command` berfungsi.
CMD ["/app/api"]
