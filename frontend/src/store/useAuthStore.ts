import { create } from "zustand";
import {
    User,
    UserRole,
    PermissionCode,
    MOCK_CURRENT_USER,
    permissionsFromRoles,
} from "../types/user";
import { decodeJwtPayload } from "../utils/jwt";
import { useWarehouseStore } from "./useWarehouseStore";

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

export const useAuthStore = create<AuthState>((set, get) => ({
    user: MOCK_CURRENT_USER,
    token: "mock-jwt-token-xyz-12345",
    refreshToken: "mock-refresh-token-xyz-99999",
    isAuthenticated: true,

    login: (user, token, refreshToken = "") =>
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
        if (
            user.roles.includes("sysadmin") ||
            (user.roles as string[]).includes("inventory_manager")
        ) {
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
