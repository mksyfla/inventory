export type UserRole =
  | 'manager'
  | 'inbound_staff'
  | 'outbound_staff'
  | 'supervisor'
  | 'master_admin'
  | 'sysadmin';

export type PermissionCode =
  | 'item.read'
  | 'item.write'
  | 'item.import'
  | 'location.read'
  | 'location.write'
  | 'partner.read'
  | 'partner.write'
  | 'grn.create'
  | 'grn.read'
  | 'grn.approve'
  | 'grn.putaway'
  | 'request.create'
  | 'request.read'
  | 'request.approve'
  | 'do.create'
  | 'do.read'
  | 'do.approve'
  | 'do.allocate'
  | 'do.pick'
  | 'do.ship'
  | 'do.pod'
  | 'transfer.read'
  | 'transfer.create'
  | 'transfer.approve'
  | 'transfer.send'
  | 'transfer.receive'
  | 'stock.read'
  | 'count.create'
  | 'count.execute'
  | 'count.approve'
  | 'adj.create'
  | 'adj.read'
  | 'adj.approve'
  | 'report.read'
  | 'dashboard.read'
  | 'audit.read'
  | 'admin.user'
  | 'admin.role';

export interface User {
  id: number;
  username: string;
  fullName: string;
  email: string;
  roles: UserRole[];
  permissions: PermissionCode[];
  assignedWarehouseIds: number[];
}

/**
 * Backend role code (from JWT claims) → frontend permission codes.
 * Mirrors the RBAC seed in backend/db/migrations/000002_seed_rbac.up.sql.
 * "ALL" expands to every PermissionCode.
 */
export const ROLE_PERMISSIONS: Record<string, PermissionCode[] | 'ALL'> = {
  sysadmin: 'ALL',
  inventory_manager: 'ALL',
  warehouse_supervisor: [
    'item.read',
    'item.write',
    'location.read',
    'location.write',
    'partner.read',
    'partner.write',
    'stock.read',
    'grn.read',
    'grn.approve',
    'grn.putaway',
    'do.read',
    'do.approve',
    'transfer.read',
    'transfer.approve',
    'request.read',
    'request.approve',
    'count.create',
    'count.execute',
    'count.approve',
    'adj.read',
    'adj.approve',
    'report.read',
    'dashboard.read',
  ],
  receiving_staff: [
    'item.read',
    'location.read',
    'partner.read',
    'stock.read',
    'grn.create',
    'grn.read',
  ],
  picker_packer: ['item.read', 'location.read', 'stock.read', 'do.read'],
  master_data_admin: [
    'item.read',
    'item.write',
    'item.import',
    'location.read',
    'location.write',
    'partner.read',
    'partner.write',
  ],
  courier: ['do.read'],
  requester: ['item.read', 'stock.read', 'request.create', 'request.read'],
  auditor: [
    'item.read',
    'location.read',
    'partner.read',
    'stock.read',
    'report.read',
    'dashboard.read',
    'audit.read',
  ],
};

export const ALL_PERMISSION_CODES: PermissionCode[] = [
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
  'do.approve',
  'do.allocate',
  'do.pick',
  'do.ship',
  'do.pod',
  'transfer.read',
  'transfer.create',
  'transfer.approve',
  'transfer.send',
  'transfer.receive',
  'stock.read',
  'count.create',
  'count.execute',
  'count.approve',
  'adj.create',
  'adj.read',
  'adj.approve',
  'report.read',
  'dashboard.read',
  'audit.read',
  'admin.user',
  'admin.role',
];

/** Expands a set of backend role codes into the frontend permission list. */
export function permissionsFromRoles(roles: string[]): PermissionCode[] {
  const seen = new Set<PermissionCode>();
  for (const role of roles) {
    const mapped = ROLE_PERMISSIONS[role];
    if (mapped === 'ALL') {
      ALL_PERMISSION_CODES.forEach((p) => seen.add(p));
    } else if (mapped) {
      mapped.forEach((p) => seen.add(p));
    }
  }
  return Array.from(seen);
}

export const MOCK_CURRENT_USER: User = {
  id: 101,
  username: 'dipo.inventory',
  fullName: 'Dipo — Inventory Manager',
  email: 'dipo@peruri.co.id',
  roles: ['manager', 'sysadmin'],
  permissions: [
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
  assignedWarehouseIds: [1, 2, 3],
};
