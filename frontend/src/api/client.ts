import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { useWarehouseStore } from "../store/useWarehouseStore";
import { generateUUID } from "../utils/uuid";
import { ApiErrorDetail, ApiResponse, TokenPair } from "./types";
import { showApiErrorNotification } from "./errorMapper";

// Base API URL configuration
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || "/api/v1";

// Flip this off (or wire to a remote log sink) for production
const ENABLE_LOGGING = import.meta.env?.DEV ?? true;

// Custom Axios Instance Interface extending InternalAxiosRequestConfig for retry tracking
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
    _retry?: boolean;
    _requestStartedAt?: number;
}

// Create configured Axios Client Instance
export const apiClient: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 15000,
});

// ==========================================
// REQUEST/RESPONSE LOGGER
// ==========================================
const SENSITIVE_KEYS = new Set([
    "password",
    "new_password",
    "confirm_password",
    "old_password",
    "access_token",
    "refresh_token",
    "token",
    "signature_url", // POD signature — treat as PII, not just noise
]);

function redactHeaders(headers: Record<string, unknown> = {}) {
    const clone = { ...headers };
    if (clone.Authorization) clone.Authorization = "[REDACTED]";
    if (clone["Idempotency-Key"]) clone["Idempotency-Key"] = clone["Idempotency-Key"]; // fine to keep, not sensitive
    return clone;
}

// Deep-clones a request/response body and masks any key in SENSITIVE_KEYS,
// at any nesting depth (e.g. inside `lines[]`, nested objects, etc.)
function redactBody(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    // FormData (file uploads, e.g. /items/import) can't be safely introspected — just flag it
    if (typeof FormData !== "undefined" && data instanceof FormData) {
        return "[FormData omitted]";
    }

    if (Array.isArray(data)) {
        return data.map((item) => redactBody(item));
    }

    if (typeof data === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            if (SENSITIVE_KEYS.has(key)) {
                result[key] = "[REDACTED]";
            } else if (typeof value === "object" && value !== null) {
                result[key] = redactBody(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    // Body sent as a raw JSON string (e.g. already stringified) — try to parse, redact, and note it
    if (typeof data === "string") {
        try {
            const parsed = JSON.parse(data);
            return redactBody(parsed);
        } catch {
            return data;
        }
    }

    return data;
}

function logRequest(config: CustomAxiosRequestConfig) {
    if (!ENABLE_LOGGING) return;
    const method = (config.method ?? "get").toUpperCase();
    const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
    const requestId = (config.headers as Record<string, string>)?.["X-Request-Id"];

    console.groupCollapsed(`%c→ ${method} ${url}`, "color:#5b8def;font-weight:bold;");
    console.log("Request ID:", requestId);
    console.log("Headers:", redactHeaders(config.headers as Record<string, unknown>));
    if (config.params) console.log("Params:", config.params);
    if (config.data) console.log("Body:", redactBody(config.data));
    console.groupEnd();
}

function logResponse(response: AxiosResponse) {
    if (!ENABLE_LOGGING) return;
    const config = response.config as CustomAxiosRequestConfig;
    const method = (config.method ?? "get").toUpperCase();
    const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
    const duration = config._requestStartedAt
        ? Math.round(performance.now() - config._requestStartedAt)
        : undefined;

    console.groupCollapsed(
        `%c← ${response.status} ${method} ${url} ${duration !== undefined ? `(${duration}ms)` : ""}`,
        "color:#2fa84f;font-weight:bold;",
    );
    console.log("Response data:", redactBody(response.data));
    console.groupEnd();
}

function logError(error: AxiosError) {
    if (!ENABLE_LOGGING) return;
    const config = error.config as CustomAxiosRequestConfig | undefined;
    const method = (config?.method ?? "get").toUpperCase();
    const url = `${config?.baseURL ?? ""}${config?.url ?? ""}`;
    const duration = config?._requestStartedAt
        ? Math.round(performance.now() - config._requestStartedAt)
        : undefined;
    const status = error.response?.status ?? "NETWORK_ERROR";

    console.groupCollapsed(
        `%c✕ ${status} ${method} ${url} ${duration !== undefined ? `(${duration}ms)` : ""}`,
        "color:#e0483e;font-weight:bold;",
    );
    console.log("Request body:", config?.data ? redactBody(config.data) : undefined);
    console.log("Error:", error.response?.data ? redactBody(error.response.data) : error.message);
    console.groupEnd();
}

// ==========================================
// REFRESH LOCK / QUEUE
// ==========================================
// /auth/refresh ROTATES the refresh token (old one is revoked — see OpenAPI
// spec). If two requests 401 concurrently, only ONE refresh call may fire;
// everything else must wait for it and reuse the new access token.
let isRefreshing = false;
let failedQueue: {
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
}[] = [];

function processQueue(error: unknown, token: string | null = null) {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error || !token) {
            reject(error);
        } else {
            resolve(token);
        }
    });
    failedQueue = [];
}

// ==========================================
// REQUEST INTERCEPTOR
// ==========================================
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const customConfig = config as CustomAxiosRequestConfig;
        customConfig.headers = customConfig.headers || {};

        // 1. Authorization Header (Bearer JWT token)
        const token = useAuthStore.getState().token;
        if (token && !customConfig.headers.Authorization) {
            customConfig.headers.Authorization = `Bearer ${token}`;
        }

        // 2. X-Request-Id Header (UUID v4)
        if (!customConfig.headers["X-Request-Id"]) {
            customConfig.headers["X-Request-Id"] = generateUUID();
        }

        // 3. X-Warehouse-Id Header (Active Warehouse Code — backend expects the CODE e.g. "WH01")
        const activeWarehouseCode = useWarehouseStore.getState().activeWarehouseCode;
        if (activeWarehouseCode && !customConfig.headers["X-Warehouse-Id"]) {
            customConfig.headers["X-Warehouse-Id"] = activeWarehouseCode;
        }

        // 4. Idempotency-Key Header for Mutation Methods (POST, PUT, PATCH, DELETE)
        const method = customConfig.method?.toUpperCase();
        if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
            if (!customConfig.headers["Idempotency-Key"]) {
                customConfig.headers["Idempotency-Key"] = generateUUID();
            }
        }

        // 5. Timestamp for duration logging
        customConfig._requestStartedAt = performance.now();

        logRequest(customConfig);

        return customConfig;
    },
    (error) => {
        if (ENABLE_LOGGING) console.error("Request setup error:", error);
        return Promise.reject(error);
    },
);

// ==========================================
// RESPONSE INTERCEPTOR
// ==========================================
apiClient.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => {
        logResponse(response);

        // Check if envelope returned success = false inside HTTP 200
        if (response.data && response.data.success === false && response.data.error) {
            showApiErrorNotification(response.data.error);
            return Promise.reject(response.data.error);
        }
        return response;
    },
    async (error: AxiosError<ApiResponse>) => {
        logError(error);

        const originalRequest = error.config as CustomAxiosRequestConfig;

        // Default error detail fallback
        let apiError: ApiErrorDetail = {
            code: "ERR_INTERNAL",
            message: "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.",
        };

        if (error.response?.data?.error) {
            apiError = error.response.data.error;
        } else if (error.response?.status === 401) {
            apiError = { code: "ERR_UNAUTHENTICATED", message: "Sesi Anda telah berakhir." };
        } else if (error.response?.status === 403) {
            apiError = { code: "ERR_FORBIDDEN", message: "Akses ditolak." };
        } else if (error.response?.status === 404) {
            apiError = { code: "ERR_NOT_FOUND", message: "Data tidak ditemukan." };
        }

        // Handle HTTP 401 Unauthorized (Token Refresh / Silent Logout)
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
            // Never try to "refresh" a refresh call itself — avoids infinite loop
            // if /auth/refresh returns 401 (e.g. expired/revoked refresh token).
            if (originalRequest.url?.includes("/auth/refresh")) {
                useAuthStore.getState().logout();
                if (typeof window !== "undefined" && window.location.pathname !== "/login") {
                    window.location.href = "/login";
                }
                return Promise.reject(apiError);
            }

            originalRequest._retry = true;

            // A refresh is already in flight — queue this request instead of
            // firing a second /auth/refresh (which would use the now-rotated,
            // soon-to-be-revoked token and needlessly fail).
            if (isRefreshing) {
                return new Promise<string>((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((newToken) => {
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        return apiClient(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            isRefreshing = true;
            if (ENABLE_LOGGING)
                console.log("%c⟳ Refreshing access token…", "color:#e0a83e;font-weight:bold;");

            try {
                // Attempt Token Rotation via /auth/refresh (refresh token in body, per OpenAPI contract)
                const refreshToken = useAuthStore.getState().refreshToken;
                if (!refreshToken) {
                    throw new Error("No refresh token available");
                }
                const refreshResponse = await axios.post<ApiResponse<TokenPair>>(
                    `${API_BASE_URL}/auth/refresh`,
                    { refresh_token: refreshToken },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "X-Request-Id": generateUUID(),
                        },
                    },
                );

                if (refreshResponse.data?.success && refreshResponse.data.data?.access_token) {
                    const newToken = refreshResponse.data.data.access_token;
                    const newRefreshToken = refreshResponse.data.data.refresh_token;
                    const currentUser = useAuthStore.getState().user;
                    if (currentUser) {
                        useAuthStore.getState().login(currentUser, newToken, newRefreshToken);
                    }

                    apiClient.defaults.headers.common.Authorization = `Bearer ${newToken}`;
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;

                    if (ENABLE_LOGGING)
                        console.log("%c✓ Token refreshed", "color:#2fa84f;font-weight:bold;");
                    processQueue(null, newToken);
                    return apiClient(originalRequest);
                }

                // Envelope came back success:false with no token — treat as failure
                throw new Error("Refresh response missing access_token");
            } catch (refreshErr) {
                if (ENABLE_LOGGING)
                    console.error(
                        "%c✕ Token refresh failed — logging out",
                        "color:#e0483e;font-weight:bold;",
                        refreshErr,
                    );
                // Refresh token failed -> Force Logout
                processQueue(refreshErr, null);
                useAuthStore.getState().logout();
                showApiErrorNotification({
                    code: "ERR_UNAUTHENTICATED",
                    message: "Sesi Anda telah kedaluwarsa. Silakan login kembali.",
                });
                if (typeof window !== "undefined" && window.location.pathname !== "/login") {
                    window.location.href = "/login";
                }
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }

        // Display standardized Indonesian error notification (suppressed for 404/Network in offline FE testing)
        if (error.response && error.response.status !== 404) {
            showApiErrorNotification(apiError);
        }

        return Promise.reject(apiError);
    },
);
