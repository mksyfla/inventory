import { z } from 'zod';

export type ABCClass = 'A' | 'B' | 'C';

export interface Item {
  id: number;
  publicId: string;
  sku: string;
  name: string;
  categoryId: number;
  categoryName?: string;
  baseUom: string;
  minQty: number;
  maxQty?: number;
  safetyStock: number;
  leadTimeDays: number;
  abcClass?: ABCClass;
  isBatch: boolean;
  isExpiry: boolean;
  isSerial: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export const MOCK_ITEMS: Item[] = [
  {
    id: 1,
    publicId: 'itm-001-uuid',
    sku: 'SKU-INK-001',
    name: 'Tinta Sekuriti Intaglio Hitam 5KG',
    categoryId: 2,
    categoryName: 'Tinta & Kimia Pemroses',
    baseUom: 'CAN',
    minQty: 10,
    maxQty: 100,
    safetyStock: 5,
    leadTimeDays: 7,
    abcClass: 'A',
    isBatch: true,
    isExpiry: true,
    isSerial: false,
    isActive: true,
    createdAt: '2026-08-01T08:00:00Z',
  },
  {
    id: 2,
    publicId: 'itm-002-uuid',
    sku: 'SKU-PPR-002',
    name: 'Kertas Sekuriti Watermark 90GSM Roll',
    categoryId: 3,
    categoryName: 'Kertas Dokumen Sekuriti',
    baseUom: 'ROLL',
    minQty: 5,
    maxQty: 50,
    safetyStock: 2,
    leadTimeDays: 14,
    abcClass: 'A',
    isBatch: true,
    isExpiry: false,
    isSerial: true,
    isActive: true,
    createdAt: '2026-08-02T09:30:00Z',
  },
  {
    id: 3,
    publicId: 'itm-003-uuid',
    sku: 'SKU-PKG-003',
    name: 'Karton Kemasan Korogated 40x30x20',
    categoryId: 5,
    categoryName: 'Perlengkapan Kemasan',
    baseUom: 'PCS',
    minQty: 100,
    maxQty: 1000,
    safetyStock: 50,
    leadTimeDays: 3,
    abcClass: 'C',
    isBatch: false,
    isExpiry: false,
    isSerial: false,
    isActive: true,
    createdAt: '2026-08-05T11:15:00Z',
  },
];

// Zod Validation Schema for Item Creation & Edition
export const itemSchema = z
  .object({
    sku: z
      .string()
      .min(3, 'Kode SKU minimal 3 karakter')
      .max(50, 'Kode SKU maksimal 50 karakter')
      .regex(/^[A-Za-z0-9_-]+$/, 'SKU hanya boleh berisi huruf, angka, strip (-), dan underscore (_)'),
    name: z.string().min(3, 'Nama barang minimal 3 karakter').max(255, 'Nama barang maksimal 255 karakter'),
    categoryId: z.number({ required_error: 'Kategori barang wajib dipilih' }).min(1, 'Pilih kategori yang valid'),
    baseUom: z.string().min(1, 'Satuan dasar (Base UoM) wajib diisi').max(20, 'Satuan dasar maksimal 20 karakter'),
    minQty: z.number().min(0, 'Minimal stok tidak boleh negatif'),
    maxQty: z.number().min(0, 'Maksimal stok tidak boleh negatif').optional().nullable(),
    safetyStock: z.number().min(0, 'Safety stock tidak boleh negatif'),
    leadTimeDays: z.number().min(0, 'Lead time tidak boleh negatif'),
    abcClass: z.enum(['A', 'B', 'C']).optional().nullable(),
    isBatch: z.boolean(),
    isExpiry: z.boolean(),
    isSerial: z.boolean(),
  })
  .refine(
    (data) => {
      // Constraint chk_expiry_needs_batch: NOT is_expiry OR is_batch
      if (data.isExpiry && !data.isBatch) {
        return false;
      }
      return true;
    },
    {
      message: 'Barang yang memiliki tanggal kedaluwarsa (isExpiry) wajib mengaktifkan pelacakan Batch (isBatch).',
      path: ['isBatch'],
    }
  )
  .refine(
    (data) => {
      // Constraint chk_max_gte_min: max_qty IS NULL OR max_qty >= min_qty
      if (data.maxQty !== undefined && data.maxQty !== null && data.maxQty < data.minQty) {
        return false;
      }
      return true;
    },
    {
      message: 'Maksimal stok (maxQty) harus lebih besar atau sama dengan minimal stok (minQty).',
      path: ['maxQty'],
    }
  );

export type ItemFormValues = z.infer<typeof itemSchema>;

export interface Category {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

// Kategori master untuk dropdown filter di halaman laporan/stock.
// Nilai `code` mengikuti konvensi backend (CAT-*), `name` disinkronkan
// dengan `MOCK_ITEMS` di atas agar filter tetap relevan saat pakai mock data.
export const MOCK_CATEGORIES: Category[] = [
  { id: 1, code: 'CAT-RAW', name: 'Bahan Baku Logam', is_active: true },
  { id: 2, code: 'CAT-INK', name: 'Tinta & Kimia Pemroses', is_active: true },
  { id: 3, code: 'CAT-PPR', name: 'Kertas Dokumen Sekuriti', is_active: true },
  { id: 4, code: 'CAT-ELK', name: 'Bahan Elektronik & Komponen', is_active: true },
  { id: 5, code: 'CAT-PKG', name: 'Perlengkapan Kemasan', is_active: true },
];
