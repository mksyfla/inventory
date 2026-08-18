import { create } from 'zustand';
import { User, UserRole, PermissionCode, permissionsFromRoles } from '../types/user';
import { decodeJwtPayload } from '../utils/jwt';
import { useWarehouseStore } from './useWarehouseStore';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string, refreshToken?: string) => void;
  logout: () => void;
  setSession: (accessToken: string, refreshToken: string) => void;
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

  // Hydrates auth + warehouse state from a real token pair (POST /auth/login or refresh).
  setSession: (accessToken, refreshToken) => {
    const claims = decodeJwtPayload(accessToken);
    if (!claims) {
      return;
    }
    const user: User = {
      id: claims.user_id,
      username: claims.username,
      fullName: claims.username,
      email: `${claims.username}@simbar.local`,
      roles: (claims.roles || []) as unknown as UserRole[],
      permissions: permissionsFromRoles(claims.roles || []),
      assignedWarehouseIds: [],
    };
    try {
      localStorage.setItem('simbar_auth_user', JSON.stringify(user));
      localStorage.setItem('simbar_auth_token', accessToken);
    } catch {
      // Ignore storage errors
    }
    set({
      user,
      token: accessToken,
      refreshToken,
      isAuthenticated: true,
    });
    // Seed warehouse store from JWT warehouse codes (backend has no /warehouses endpoint).
    useWarehouseStore.getState().setWarehousesFromCodes(claims.warehouses || []);
  },

  hasPermission: (permission: PermissionCode) => {
    const user = get().user;
    if (!user) return false;
    if (user.roles.includes('sysadmin') || (user.roles as string[]).includes('inventory_manager')) {
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

