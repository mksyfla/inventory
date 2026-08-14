import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PermissionGuard } from '../components/PermissionGuard';
import { useAuthStore } from '../store/useAuthStore';

describe('PermissionGuard Component', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 2,
        username: 'staff.outbound',
        fullName: 'Staf Outbound',
        email: 'outbound@peruri.co.id',
        roles: ['outbound_staff'],
        permissions: ['do.read', 'do.pick'],
        assignedWarehouseIds: [1],
      },
    });
  });

  it('renders children when user possesses required permission', () => {
    render(
      <MemoryRouter>
        <PermissionGuard permission="do.read">
          <div data-testid="allowed-content">Pengeluaran DO</div>
        </PermissionGuard>
      </MemoryRouter>
    );

    expect(screen.getByTestId('allowed-content')).toBeInTheDocument();
  });

  it('renders ForbiddenPage (403) when user lacks required permission', () => {
    render(
      <MemoryRouter>
        <PermissionGuard permission="admin.user">
          <div data-testid="allowed-content">Pengeluaran DO</div>
        </PermissionGuard>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('allowed-content')).not.toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByText(/tidak memiliki hak akses/i)).toBeInTheDocument();
  });

  it('renders custom fallback when provided and user lacks permission', () => {
    render(
      <MemoryRouter>
        <PermissionGuard permission="admin.user" fallback={<div data-testid="custom-fallback">No Access</div>}>
          <div data-testid="allowed-content">Pengeluaran DO</div>
        </PermissionGuard>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('allowed-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });
});
