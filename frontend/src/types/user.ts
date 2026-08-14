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
  | 'do.allocate'
  | 'do.pick'
  | 'do.ship'
  | 'do.pod'
  | 'transfer.read'
  | 'transfer.create'
  | 'transfer.send'
  | 'transfer.receive'
  | 'stock.read'
  | 'count.create'
  | 'count.execute'
  | 'count.approve'
  | 'adj.create'
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
