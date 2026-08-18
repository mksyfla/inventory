import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuthStore } from '../store/useAuthStore';

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      token: null,
    });
  });

  it('redirects to /login when user is unauthenticated', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/login',
          element: <div data-testid="login-screen">Halaman Login</div>,
        },
        {
          path: '/dashboard',
          element: (
            <ProtectedRoute>
              <div data-testid="dashboard-screen">Halaman Dashboard</div>
            </ProtectedRoute>
          ),
        },
      ],
      { initialEntries: ['/dashboard'] }
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('login-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-screen')).not.toBeInTheDocument();
  });

  it('renders protected content when user is authenticated', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 1,
        username: 'test.user',
        fullName: 'Test User',
        email: 'test@peruri.co.id',
        roles: ['manager'],
        permissions: ['dashboard.read'],
        assignedWarehouseIds: [1],
      },
      token: 'jwt-token',
    });

    const router = createMemoryRouter(
      [
        {
          path: '/dashboard',
          element: (
            <ProtectedRoute>
              <div data-testid="dashboard-screen">Halaman Dashboard</div>
            </ProtectedRoute>
          ),
        },
      ],
      { initialEntries: ['/dashboard'] }
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('dashboard-screen')).toBeInTheDocument();
  });
});
