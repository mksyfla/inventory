import { apiClient } from './client';
import { ApiResponse } from './types';

type Config = Parameters<typeof apiClient.get>[1];

/**
 * Unwraps the SIMBAR ApiResponse envelope, returning `data`.
 * The axios response interceptor already rejects on HTTP errors and on
 * `success === false`, so callers can assume data is present on resolve.
 */
export async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  return data.data as T;
}

export async function get<T>(url: string, config?: Config): Promise<T> {
  return unwrap(apiClient.get<ApiResponse<T>>(url, config));
}

export async function post<T>(url: string, body?: unknown, config?: Config): Promise<T> {
  return unwrap(apiClient.post<ApiResponse<T>>(url, body, config));
}

export async function patch<T>(url: string, body?: unknown, config?: Config): Promise<T> {
  return unwrap(apiClient.patch<ApiResponse<T>>(url, body, config));
}

export async function put<T>(url: string, body?: unknown, config?: Config): Promise<T> {
  return unwrap(apiClient.put<ApiResponse<T>>(url, body, config));
}

export async function del<T = undefined>(url: string, config?: Config): Promise<T> {
  return unwrap(apiClient.delete<ApiResponse<T>>(url, config));
}
