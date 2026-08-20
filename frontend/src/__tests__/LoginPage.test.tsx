import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../store/useAuthStore';
import { authService } from '../api/services/auth';
import { useWarehouseStore } from '../store/useWarehouseStore';

vi.mock('../api/services/auth', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  },
}));

// A real JWT whose payload contains user_id 1, username "dipo.inventory",
// roles [sysadmin], warehouses [WH01] — decoded by setSession.
const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const MOCK_ACCESS_TOKEN = `${b64('{"alg":"HS256"}')}.${b64(
  JSON.stringify({
    user_id: 1,
    username: 'dipo.inventory',
    roles: ['sysadmin'],
    warehouses: ['WH01'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
)}.${b64('sig')}`;

describe('LoginPage Component', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      token: null,
    });
    useWarehouseStore.setState({
      warehouses: [],
      activeWarehouseId: 0,
      activeWarehouse: undefined,
      activeWarehouseCode: undefined,
    });
    (authService.login as ReturnType<typeof vi.fn>).mockResolvedValue({
      access_token: MOCK_ACCESS_TOKEN,
      refresh_token: 'refresh-abc',
      token_type: 'Bearer',
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

  it('submits form with valid credentials and logs user in', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      );
    });

    const usernameInput = screen.getByTestId('input-username');
    const passwordInput = screen.getByTestId('input-password');
    const submitBtn = screen.getByTestId('btn-login-submit');

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: 'dipo.inventory' } });
      fireEvent.change(passwordInput, { target: { value: 'Dipo@123456' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.username).toBe('dipo.inventory');
    });
  });

});

