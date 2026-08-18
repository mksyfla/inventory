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

export const MOCK_DEMO_USERS: Record<string, User> = {
  manager: MOCK_CURRENT_USER,
  inbound: {
    id: 102,
    username: 'budi.inbound',
    fullName: 'Budi Santoso — Staf Inbound',
    email: 'budi.inbound@peruri.co.id',
    roles: ['inbound_staff'],
    permissions: [
      'dashboard.read',
      'item.read',
      'location.read',
      'partner.read',
      'grn.create',
      'grn.read',
      'grn.putaway',
      'stock.read',
    ],
    assignedWarehouseIds: [1],
  },
  outbound: {
    id: 103,
    username: 'siti.outbound',
    fullName: 'Siti Rahma — Staf Outbound',
    email: 'siti.outbound@peruri.co.id',
    roles: ['outbound_staff'],
    permissions: [
      'dashboard.read',
      'item.read',
      'location.read',
      'partner.read',
      'request.create',
      'request.read',
      'do.create',
      'do.read',
      'do.allocate',
      'do.pick',
      'do.ship',
      'do.pod',
      'stock.read',
    ],
    assignedWarehouseIds: [1, 2],
  },
  supervisor: {
    id: 104,
    username: 'agus.supervisor',
    fullName: 'Agus Wijaya — Supervisor Gudang',
    email: 'agus.supervisor@peruri.co.id',
    roles: ['supervisor'],
    permissions: [
      'dashboard.read',
      'item.read',
      'item.write',
      'location.read',
      'partner.read',
      'grn.read',
      'grn.approve',
      'request.read',
      'request.approve',
      'do.read',
      'transfer.read',
      'transfer.create',
      'transfer.send',
      'transfer.receive',
      'stock.read',
      'count.create',
      'count.approve',
      'report.read',
      'audit.read',
    ],
    assignedWarehouseIds: [1, 2, 3],
  },
};

