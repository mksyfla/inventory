import { create } from 'zustand';
import { User, UserRole, PermissionCode } from '../types/user';
import { mapJwtToUser } from '../utils/jwt';
import { logoutApi } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string, refreshToken?: string) => void;
  loginWithTokens: (accessToken: string, refreshToken?: string) => void;
  logout: () => void;
  hasPermission: (permission: PermissionCode) => boolean;
  hasRole: (role: UserRole) => boolean;
}

const STORAGE_KEY_TOKEN = 'simbar_access_token';
const STORAGE_KEY_REFRESH = 'simbar_refresh_token';
const STORAGE_KEY_USER = 'simbar_user';

// Initialize state from localStorage if present
const storedToken = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_TOKEN) : null;
const storedRefreshToken = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_REFRESH) : null;
const storedUserRaw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_USER) : null;

let initialUser: User | null = null;
if (storedUserRaw) {
  try {
    initialUser = JSON.parse(storedUserRaw);
  } catch {
    initialUser = storedToken ? mapJwtToUser(storedToken) : null;
  }
} else if (storedToken) {
  initialUser = mapJwtToUser(storedToken);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initialUser,
  token: storedToken,
  refreshToken: storedRefreshToken,
  isAuthenticated: Boolean(storedToken),

  login: (user, token, refreshToken = '') => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      if (refreshToken) localStorage.setItem(STORAGE_KEY_REFRESH, refreshToken);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    }
    set({
      user,
      token,
      refreshToken: refreshToken || null,
      isAuthenticated: true,
    });
  },

  loginWithTokens: (accessToken: string, refreshToken = '') => {
    const user = mapJwtToUser(accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
      if (refreshToken) localStorage.setItem(STORAGE_KEY_REFRESH, refreshToken);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    }
    set({
      user,
      token: accessToken,
      refreshToken: refreshToken || null,
      isAuthenticated: true,
    });
  },

  logout: () => {
    const currentRefreshToken = get().refreshToken;
    if (currentRefreshToken) {
      logoutApi(currentRefreshToken);
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_REFRESH);
      localStorage.removeItem(STORAGE_KEY_USER);
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
