# ── Build stage ─────────────────────────────────────────────────────────────
# SIMBAR frontend (React 19 + Vite): source → static bundle di `dist`.
FROM node:20-alpine AS build

WORKDIR /app

# Dependency layer caching: hanya package.json / package-lock.json yang berubah
# → layer `npm ci` ini di-reuse.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Env yang di-bake saat build (import.meta.env.VITE_*). Default `same-origin`
# via proxy nginx (`/api/v1`) — tidak perlu diubah untuk stack compose.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────────────────
# nginx statik untuk bundle SPA + reverse proxy `/api/*` ke service `api`.
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Healthcheck ringan (busybox wget bawaan alpine).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
