import { z } from 'zod';

export type LocationType =
  | 'warehouse'
  | 'zone'
  | 'rack'
  | 'bin'
  | 'staging_inbound'
  | 'staging_outbound'
  | 'quarantine'
  | 'damaged';

export interface LocationNode {
  id: number;
  warehouseId: number;
  code: string;
  name: string;
  type: LocationType;
  parentId?: number | null;
  capacityVolumeM3?: number;
  capacityWeightKg?: number;
  isActive: boolean;
  isLocked: boolean;
  children?: LocationNode[];
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address?: string;
  isActive: boolean;
}

export const locationSchema = z.object({
  code: z
    .string()
    .min(2, 'Kode lokasi minimal 2 karakter')
    .max(50, 'Kode lokasi maksimal 50 karakter')
    .regex(/^[A-Za-z0-9_-]+$/, 'Kode lokasi hanya boleh berisi huruf, angka, strip (-), dan underscore (_)')
    .toUpperCase(),
  name: z.string().min(2, 'Nama lokasi minimal 2 karakter').max(100, 'Nama lokasi maksimal 100 karakter'),
  type: z.enum([
    'warehouse',
    'zone',
    'rack',
    'bin',
    'staging_inbound',
    'staging_outbound',
    'quarantine',
    'damaged',
  ]),
  parentId: z.number().nullable().optional(),
  capacityVolumeM3: z
    .number()
    .min(0.01, 'Kapasitas volume harus lebih besar dari 0 (m³)')
    .optional()
    .nullable(),
  capacityWeightKg: z
    .number()
    .min(0.01, 'Kapasitas berat harus lebih besar dari 0 (kg)')
    .optional()
    .nullable(),
  isActive: z.boolean(),
  isLocked: z.boolean(),
});

export type LocationFormValues = z.infer<typeof locationSchema>;

export const MOCK_WAREHOUSES: Warehouse[] = [
  { id: 1, code: 'WH-JKT01', name: 'Gudang Utama Jakarta (Kawasan Peruri)', address: 'Jl. Palatehan No.4, Kebayoran Baru, Jakarta Selatan', isActive: true },
  { id: 2, code: 'WH-BDG01', name: 'Gudang Satelit Bandung', address: 'Jl. Asia Afrika No.10, Bandung', isActive: true },
  { id: 3, code: 'WH-KRW01', name: 'Gudang Karawang Plant 2', address: 'Kawasan Industri Peruri, Karawang', isActive: true },
];

export const MOCK_LOCATIONS = [
  { id: 1001, code: 'JKT01-Z1-R01-B01', name: 'Bin A1-01 (Tinta Intaglio)', type: 'bin' },
  { id: 1002, code: 'JKT01-Z1-R01-B02', name: 'Bin A1-02 (Tinta Offset)', type: 'bin' },
  { id: 1003, code: 'SBY01-Z1-R01-B01', name: 'Bin B1-01 Gudang Surabaya', type: 'bin' },
  { id: 1004, code: 'KRW01-Z1-R01-B02', name: 'Bin K1-02 Gudang Karawang', type: 'bin' },
];

export const MOCK_LOCATIONS_TREE: LocationNode[] = [
  {
    id: 10,
    warehouseId: 1,
    code: 'JKT01-Z1',
    name: 'Zona A - Bahan Baku & Tinta Cetak',
    type: 'zone',
    isActive: true,
    isLocked: false,
    children: [
      {
        id: 101,
        warehouseId: 1,
        code: 'JKT01-Z1-R01',
        name: 'Rak A1 (Pallet Heavy Duty)',
        type: 'rack',
        parentId: 10,
        isActive: true,
        isLocked: false,
        children: [
          {
            id: 1001,
            warehouseId: 1,
            code: 'JKT01-Z1-R01-B01',
            name: 'Bin A1-01 (Tinta Intaglio)',
            type: 'bin',
            parentId: 101,
            capacityVolumeM3: 2.5,
            capacityWeightKg: 500,
            isActive: true,
            isLocked: false,
          },
          {
            id: 1002,
            warehouseId: 1,
            code: 'JKT01-Z1-R01-B02',
            name: 'Bin A1-02 (Tinta Offset)',
            type: 'bin',
            parentId: 101,
            capacityVolumeM3: 2.5,
            capacityWeightKg: 500,
            isActive: true,
            isLocked: false,
          },
        ],
      },
    ],
  },
  {
    id: 20,
    warehouseId: 1,
    code: 'JKT01-STG-IN',
    name: 'Area Staging Penerimaan (Inbound)',
    type: 'staging_inbound',
    capacityVolumeM3: 50,
    capacityWeightKg: 10000,
    isActive: true,
    isLocked: false,
  },
  {
    id: 30,
    warehouseId: 1,
    code: 'JKT01-QRN',
    name: 'Area Karantina & QC Lab',
    type: 'quarantine',
    capacityVolumeM3: 15,
    capacityWeightKg: 3000,
    isActive: true,
    isLocked: true,
  },
];
