import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../store/useAuthStore';
import * as authApi from '../api/auth';

// Valid mock JWT with dipo.inventory claims
const MOCK_JWT_PAYLOAD = btoa(
  JSON.stringify({
    user_id: 101,
    username: 'dipo.inventory',
    roles: ['manager', 'sysadmin'],
    warehouses: ['WH-JKT01'],
    sub: '101',
  })
);
const MOCK_ACCESS_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${MOCK_JWT_PAYLOAD}.mock_signature`;

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
    });
  });

  it('renders login form with username, password fields and login button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-username')).toBeInTheDocument();
    expect(screen.getByTestId('input-password')).toBeInTheDocument();
    expect(screen.getByTestId('btn-login-submit')).toBeInTheDocument();
  });

  it('submits form with valid credentials and logs user in via loginApi', async () => {
    const loginSpy = vi.spyOn(authApi, 'loginApi').mockResolvedValueOnce({
      access_token: MOCK_ACCESS_TOKEN,
      refresh_token: 'mock-refresh-token-xyz',
      token_type: 'Bearer',
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      );
    });

    const submitBtn = screen.getByTestId('btn-login-submit');

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({
        username: 'dipo.inventory',
        password: 'password123',
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.username).toBe('dipo.inventory');
      expect(useAuthStore.getState().token).toBe(MOCK_ACCESS_TOKEN);
    });
  });

  it('displays error alert when loginApi fails with unauthenticated error', async () => {
    vi.spyOn(authApi, 'loginApi').mockRejectedValueOnce({
      code: 'ERR_UNAUTHENTICATED',
      message: 'Invalid credentials',
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      );
    });

    const submitBtn = screen.getByTestId('btn-login-submit');

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-error-alert')).toBeInTheDocument();
      expect(screen.getByText('Username atau kata sandi tidak sesuai.')).toBeInTheDocument();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });
});
