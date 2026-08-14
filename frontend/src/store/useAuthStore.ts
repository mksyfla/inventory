import { create } from 'zustand';
import { User, UserRole, PermissionCode, MOCK_CURRENT_USER } from '../types/user';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string, refreshToken?: string) => void;
  logout: () => void;
  hasPermission: (permission: PermissionCode) => boolean;
  hasRole: (role: UserRole) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: MOCK_CURRENT_USER,
  token: 'mock-jwt-token-xyz-12345',
  refreshToken: 'mock-refresh-token-xyz-99999',
  isAuthenticated: true,

  login: (user, token, refreshToken = 'mock-refresh-token-xyz-99999') =>
    set({
      user,
      token,
      refreshToken,
      isAuthenticated: true,
    }),

  logout: () =>
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    }),

  hasPermission: (permission: PermissionCode) => {
    const user = get().user;
    if (!user) return false;
    // Sysadmin / Manager has all permissions by default
    if (user.roles.includes('sysadmin') || user.roles.includes('manager')) {
      return true;
    }
    return user.permissions.includes(permission);
  },

  hasRole: (role: UserRole) => {
    const user = get().user;
    if (!user) return false;
    return user.roles.includes(role);
  },
}));
