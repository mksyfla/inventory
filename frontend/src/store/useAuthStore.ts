import { create } from 'zustand';
import { User, UserRole, PermissionCode } from '../types/user';

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

const getStoredAuth = () => {
  try {
    const storedUser = localStorage.getItem('simbar_auth_user');
    const storedToken = localStorage.getItem('simbar_auth_token');
    if (storedUser && storedToken) {
      return {
        user: JSON.parse(storedUser) as User,
        token: storedToken,
        isAuthenticated: true,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return {
    user: null,
    token: null,
    isAuthenticated: false,
  };
};

const initialAuth = getStoredAuth();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initialAuth.user,
  token: initialAuth.token,
  refreshToken: initialAuth.token ? 'mock-refresh-token-xyz-99999' : null,
  isAuthenticated: initialAuth.isAuthenticated,

  login: (user, token, refreshToken = 'mock-refresh-token-xyz-99999') => {
    try {
      localStorage.setItem('simbar_auth_user', JSON.stringify(user));
      localStorage.setItem('simbar_auth_token', token);
    } catch {
      // Ignore storage errors
    }
    set({
      user,
      token,
      refreshToken,
      isAuthenticated: true,
    });
  },

  logout: () => {
    try {
      localStorage.removeItem('simbar_auth_user');
      localStorage.removeItem('simbar_auth_token');
    } catch {
      // Ignore storage errors
    }
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

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
