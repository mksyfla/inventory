import { z } from 'zod';

export interface UserAccount {
  id: number;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  roles: string[];
  assignedWarehouseIds: number[];
  assignedWarehouseNames: string[];
  isActive: boolean;
  lastLoginAt?: string;
}

export const userFormSchema = z.object({
  username: z
    .string()
    .min(3, 'Username minimal 3 karakter')
    .max(30, 'Username maksimal 30 karakter')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username hanya boleh huruf, angka, titik, strip, dan underscore'),
  fullName: z.string().min(2, 'Nama lengkap minimal 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  phone: z.string().optional(),
  password: z.string().optional(),
  roles: z.array(z.string()).min(1, 'Minimal satu peran (role) wajib dipilih'),
  assignedWarehouseIds: z.array(z.number()).min(1, 'Minimal satu gudang wajib ditugaskan'),
  isActive: z.boolean(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

export interface PermissionItem {
  key: string;
  name: string;
  domain: string;
}

export interface RoleItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
}

export const roleFormSchema = z.object({
  code: z.string().min(2, 'Kode peran minimal 2 karakter').toUpperCase(),
  name: z.string().min(2, 'Nama peran minimal 2 karakter'),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1, 'Minimal satu izin akses wajib dipilih'),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;

export interface SystemSettings {
  companyName: string;
  minStockThresholdPct: number;
  expiryWarningDays: number;
  sessionTimeoutMinutes: number;
  valuationMethod: 'FIFO' | 'LIFO' | 'AVERAGE';
  makerCheckerEnabled: boolean;
}

export const MOCK_USER_LIST: UserAccount[] = [
  {
    id: 1,
    username: 'dipo.manager',
    fullName: 'Dipo Inventory (Manager)',
    email: 'dipo.inventory@peruri.co.id',
    phone: '081298421000',
    roles: ['Warehouse Manager'],
    assignedWarehouseIds: [1, 2, 3],
    assignedWarehouseNames: ['Gudang Utama Jakarta', 'Gudang Satelit Bandung', 'Gudang Karawang'],
    isActive: true,
    lastLoginAt: '2026-08-17 11:30:00',
  },
  {
    id: 2,
    username: 'ahmad.inbound',
    fullName: 'Ahmad Staff Inbound',
    email: 'ahmad.inbound@peruri.co.id',
    phone: '081311223344',
    roles: ['Inbound Staff'],
    assignedWarehouseIds: [1],
    assignedWarehouseNames: ['Gudang Utama Jakarta'],
    isActive: true,
    lastLoginAt: '2026-08-17 08:15:00',
  },
  {
    id: 3,
    username: 'budi.outbound',
    fullName: 'Budi Staff Outbound',
    email: 'budi.outbound@peruri.co.id',
    phone: '081599887766',
    roles: ['Outbound Staff'],
    assignedWarehouseIds: [1],
    assignedWarehouseNames: ['Gudang Utama Jakarta'],
    isActive: false,
    lastLoginAt: '2026-08-10 16:45:00',
  },
];

export const MOCK_PERMISSIONS_MATRIX: PermissionItem[] = [
  { key: 'dashboard.read', name: 'Melihat Dashboard', domain: 'Dashboard' },
  { key: 'item.read', name: 'Melihat Master Barang', domain: 'Master Data' },
  { key: 'item.write', name: 'Mengelola Master Barang', domain: 'Master Data' },
  { key: 'location.read', name: 'Melihat Gudang & Lokasi', domain: 'Master Data' },
  { key: 'location.write', name: 'Mengelola Gudang & Lokasi', domain: 'Master Data' },
  { key: 'partner.read', name: 'Melihat Pemasok & Pelanggan', domain: 'Master Data' },
  { key: 'grn.read', name: 'Melihat Penerimaan (GRN)', domain: 'Inbound' },
  { key: 'grn.create', name: 'Membuat Penerimaan (GRN)', domain: 'Inbound' },
  { key: 'grn.approve', name: 'Persetujuan GRN (Maker-Checker)', domain: 'Inbound' },
  { key: 'grn.putaway', name: 'Eksekusi Putaway & Bin', domain: 'Inbound' },
  { key: 'request.read', name: 'Melihat Permintaan (Request)', domain: 'Outbound' },
  { key: 'request.create', name: 'Membuat Permintaan (Request)', domain: 'Outbound' },
  { key: 'do.read', name: 'Melihat Pengiriman (DO)', domain: 'Outbound' },
  { key: 'do.picking', name: 'Eksekusi Picking Barcode', domain: 'Outbound' },
  { key: 'transfer.create', name: 'Mengelola Mutasi Antar Gudang', domain: 'Transfer' },
  { key: 'stock.read', name: 'Melihat Stok & Kartu Stok', domain: 'Stock' },
  { key: 'count.create', name: 'Mengelola Stock Opname & ADJ', domain: 'Counting' },
  { key: 'report.read', name: 'Melihat Laporan & Analitik', domain: 'Reports' },
  { key: 'admin.user', name: 'Mengelola User, Role & Setting', domain: 'Admin' },
];

export const MOCK_ROLE_LIST: RoleItem[] = [
  {
    id: 1,
    code: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'Akses penuh ke seluruh modul sistem SIMBAR WMS',
    permissions: MOCK_PERMISSIONS_MATRIX.map((p) => p.key),
    isSystem: true,
  },
  {
    id: 2,
    code: 'WH_MANAGER',
    name: 'Warehouse Manager',
    description: 'Manajer gudang dengan akses approval, mutasi, dan laporan',
    permissions: [
      'dashboard.read',
      'item.read',
      'location.read',
      'grn.read',
      'grn.approve',
      'request.read',
      'do.read',
      'transfer.create',
      'stock.read',
      'count.create',
      'report.read',
    ],
    isSystem: true,
  },
  {
    id: 3,
    code: 'INBOUND_STAFF',
    name: 'Inbound Staff',
    description: 'Petugas lapangan untuk penerimaan barang dan putaway',
    permissions: ['dashboard.read', 'item.read', 'grn.read', 'grn.create', 'grn.putaway', 'stock.read'],
    isSystem: false,
  },
];

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  companyName: 'PT Perum Peruri (Persero) - SIMBAR WMS',
  minStockThresholdPct: 15,
  expiryWarningDays: 60,
  sessionTimeoutMinutes: 30,
  valuationMethod: 'FIFO',
  makerCheckerEnabled: true,
};
