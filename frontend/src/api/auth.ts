import { apiClient } from './client';
import { ApiResponse } from './types';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  full_name: string;
  password: string;
}

export interface RegisterResponse {
  id: number;
  username: string;
  full_name: string;
}

/**
 * Calls backend POST /api/v1/auth/login
 */
export async function loginApi(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<ApiResponse<LoginResponse>>('/auth/login', data);
  if (!response.data || !response.data.data) {
    throw new Error('Respon login tidak valid dari server.');
  }
  return response.data.data;
}

/**
 * Calls backend POST /api/v1/auth/refresh
 */
export async function refreshTokenApi(refreshToken: string): Promise<RefreshResponse> {
  const response = await apiClient.post<ApiResponse<RefreshResponse>>('/auth/refresh', {
    refresh_token: refreshToken,
  } as RefreshRequest);
  if (!response.data || !response.data.data) {
    throw new Error('Respon refresh token tidak valid dari server.');
  }
  return response.data.data;
}

/**
 * Calls backend POST /api/v1/auth/logout
 */
export async function logoutApi(refreshToken: string): Promise<void> {
  try {
    await apiClient.post<ApiResponse<string>>('/auth/logout', {
      refresh_token: refreshToken,
    } as RefreshRequest);
  } catch (err) {
    // Logout API best effort
    console.warn('Logout API notification failed:', err);
  }
}
