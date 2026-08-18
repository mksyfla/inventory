import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../store/useAuthStore';
import { MOCK_CURRENT_USER } from '../types/user';

describe('useAuthStore State & RBAC Evaluation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  });

  it('handles login and populates auth state', () => {
    useAuthStore.getState().login(MOCK_CURRENT_USER, 'token-123', 'refresh-456');

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.username).toBe('dipo.inventory');
    expect(useAuthStore.getState().token).toBe('token-123');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-456');
  });

  it('handles logout and clears auth state', () => {
    useAuthStore.getState().login(MOCK_CURRENT_USER, 'token-123');
    useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('evaluates hasPermission correctly based on user roles and permissions', () => {
    useAuthStore.getState().login(MOCK_CURRENT_USER, 'token-123');

    // Manager / sysadmin role has all permissions
    expect(useAuthStore.getState().hasPermission('item.read')).toBe(true);
    expect(useAuthStore.getState().hasPermission('admin.user')).toBe(true);

    // Regular staff user
    useAuthStore.setState({
      user: {
        id: 202,
        username: 'staff.inbound',
        fullName: 'Staf Penerimaan',
        email: 'staf@peruri.co.id',
        roles: ['inbound_staff'],
        permissions: ['grn.create', 'grn.read', 'grn.putaway'],
        assignedWarehouseIds: [1],
      },
    });

    expect(useAuthStore.getState().hasPermission('grn.create')).toBe(true);
    expect(useAuthStore.getState().hasPermission('admin.user')).toBe(false);
  });
});
