import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { generateUUID } from '../utils/uuid';
import { ApiErrorDetail, ApiResponse } from './types';
import { showApiErrorNotification } from './errorMapper';

// Base API URL configuration
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api/v1';

// Custom Axios Instance Interface extending InternalAxiosRequestConfig for retry tracking
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Create configured Axios Client Instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

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
    if (!customConfig.headers['X-Request-Id']) {
      customConfig.headers['X-Request-Id'] = generateUUID();
    }

    // 3. X-Warehouse-Id Header (Active Warehouse Context)
    const activeWarehouseId = useWarehouseStore.getState().activeWarehouseId;
    if (activeWarehouseId && !customConfig.headers['X-Warehouse-Id']) {
      customConfig.headers['X-Warehouse-Id'] = String(activeWarehouseId);
    }

    // 4. Idempotency-Key Header for Mutation Methods (POST, PUT, PATCH, DELETE)
    const method = customConfig.method?.toUpperCase();
    if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!customConfig.headers['Idempotency-Key']) {
        customConfig.headers['Idempotency-Key'] = generateUUID();
      }
    }

    return customConfig;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ==========================================
// RESPONSE INTERCEPTOR
// ==========================================
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // Check if envelope returned success = false inside HTTP 200
    if (response.data && response.data.success === false && response.data.error) {
      showApiErrorNotification(response.data.error);
      return Promise.reject(response.data.error);
    }
    return response;
  },
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    // Default error detail fallback
    let apiError: ApiErrorDetail = {
      code: 'ERR_INTERNAL',
      message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
    };

    if (error.response?.data?.error) {
      apiError = error.response.data.error;
    } else if (error.response?.status === 401) {
      apiError = { code: 'ERR_UNAUTHENTICATED', message: 'Sesi Anda telah berakhir.' };
    } else if (error.response?.status === 403) {
      apiError = { code: 'ERR_FORBIDDEN', message: 'Akses ditolak.' };
    } else if (error.response?.status === 404) {
      apiError = { code: 'ERR_NOT_FOUND', message: 'Data tidak ditemukan.' };
    }

    // Handle HTTP 401 Unauthorized (Token Refresh / Silent Logout)
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const currentRefreshToken = useAuthStore.getState().refreshToken;

      if (currentRefreshToken) {
        try {
          // Attempt Token Rotation via /auth/refresh
          const refreshResponse = await axios.post<ApiResponse<{ access_token: string; refresh_token: string; token_type: string }>>(
            `${API_BASE_URL}/auth/refresh`,
            { refresh_token: currentRefreshToken },
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          if (refreshResponse.data?.success && refreshResponse.data.data?.access_token) {
            const { access_token: newAccessToken, refresh_token: newRefreshToken } = refreshResponse.data.data;
            useAuthStore.getState().loginWithTokens(newAccessToken, newRefreshToken);
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return apiClient(originalRequest);
          }
        } catch (refreshErr) {
          // Refresh token failed -> Force Logout
          useAuthStore.getState().logout();
          showApiErrorNotification({
            code: 'ERR_UNAUTHENTICATED',
            message: 'Sesi Anda telah kedaluwarsa. Silakan login kembali.',
          });
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          return Promise.reject(refreshErr);
        }
      } else {
        useAuthStore.getState().logout();
      }
    }

    // Display standardized Indonesian error notification
    showApiErrorNotification(apiError);

    return Promise.reject(apiError);
  }
);
