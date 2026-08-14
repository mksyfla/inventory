import { User, UserRole, PermissionCode } from '../types/user';

export interface JwtClaims {
  user_id?: number;
  username?: string;
  roles?: string[];
  warehouses?: string[];
  sub?: string;
  exp?: number;
  iat?: number;
  jti?: string;
  [key: string]: any;
}

/**
 * Decodes a JWT token string without requiring external dependencies.
 */
export function decodeJwtPayload(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * Role to default permissions mapping for Frontend authorization fallback.
 * [BACKEND INTEGRATION NOTE]: Backend enforces granular Casbin policies per warehouse via X-Warehouse-Id.
 * Frontend maps roles to expected UI permission sets until a dedicated permissions API endpoint is provided.
 */
const ROLE_PERMISSIONS_MAP: Record<UserRole, PermissionCode[]> = {
  sysadmin: [
    'dashboard.read',
    'item.read',
    'item.write',
    'item.import',
    'location.read',
    'location.write',
    'partner.read',
    'partner.write',
    'grn.create',
    'grn.read',
    'grn.approve',
    'grn.putaway',
    'request.create',
    'request.read',
    'request.approve',
    'do.create',
    'do.read',
    'do.allocate',
    'do.pick',
    'do.ship',
    'do.pod',
    'transfer.read',
    'transfer.create',
    'transfer.send',
    'transfer.receive',
    'stock.read',
    'count.create',
    'count.execute',
    'count.approve',
    'adj.create',
    'report.read',
    'audit.read',
    'admin.user',
    'admin.role',
  ],
  manager: [
    'dashboard.read',
    'item.read',
    'item.write',
    'item.import',
    'location.read',
    'location.write',
    'partner.read',
    'partner.write',
    'grn.create',
    'grn.read',
    'grn.approve',
    'grn.putaway',
    'request.create',
    'request.read',
    'request.approve',
    'do.create',
    'do.read',
    'do.allocate',
    'do.pick',
    'do.ship',
    'do.pod',
    'transfer.read',
    'transfer.create',
    'transfer.send',
    'transfer.receive',
    'stock.read',
    'count.create',
    'count.execute',
    'count.approve',
    'adj.create',
    'report.read',
    'audit.read',
  ],
  supervisor: [
    'dashboard.read',
    'item.read',
    'location.read',
    'partner.read',
    'grn.read',
    'grn.approve',
    'request.read',
    'request.approve',
    'do.read',
    'do.allocate',
    'transfer.read',
    'stock.read',
    'count.create',
    'count.approve',
    'report.read',
  ],
  inbound_staff: [
    'dashboard.read',
    'item.read',
    'location.read',
    'partner.read',
    'grn.create',
    'grn.read',
    'grn.putaway',
    'stock.read',
  ],
  outbound_staff: [
    'dashboard.read',
    'item.read',
    'location.read',
    'partner.read',
    'request.create',
    'request.read',
    'do.read',
    'do.pick',
    'do.ship',
    'do.pod',
    'stock.read',
  ],
  master_admin: [
    'dashboard.read',
    'item.read',
    'item.write',
    'item.import',
    'location.read',
    'location.write',
    'partner.read',
    'partner.write',
    'stock.read',
    'report.read',
  ],
};

/**
 * Converts JWT token claims into the User state object.
 */
export function mapJwtToUser(token: string): User {
  const claims = decodeJwtPayload(token);
  const userId = claims?.user_id || (claims?.sub ? parseInt(claims.sub, 10) : 1);
  const username = claims?.username || 'user';
  const rawRoles = claims?.roles || ['inbound_staff'];

  const roles = rawRoles.filter((r): r is UserRole =>
    ['manager', 'inbound_staff', 'outbound_staff', 'supervisor', 'master_admin', 'sysadmin'].includes(r)
  );

  // If no matching roles found, default to inbound_staff
  const activeRoles: UserRole[] = roles.length > 0 ? roles : ['inbound_staff'];

  // Aggregate permissions from roles
  const permissionsSet = new Set<PermissionCode>();
  activeRoles.forEach((role) => {
    const perms = ROLE_PERMISSIONS_MAP[role] || [];
    perms.forEach((p) => permissionsSet.add(p));
  });

  // Convert warehouse codes or IDs to numeric array for assigned warehouses
  const assignedWarehouseIds = [1, 2, 3]; // Default active warehouse list

  return {
    id: userId,
    username,
    fullName: username.charAt(0).toUpperCase() + username.slice(1),
    email: `${username}@peruri.co.id`,
    roles: activeRoles,
    permissions: Array.from(permissionsSet),
    assignedWarehouseIds,
  };
}
