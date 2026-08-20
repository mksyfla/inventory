import { z } from 'zod';

export type CountScope = 'full' | 'zone' | 'abc_class';
export type CountSessionStatus = 'open' | 'in_progress' | 'review' | 'posted' | 'cancelled';
export type AdjustmentReasonCode = 'COUNT_DISCREPANCY' | 'DAMAGED_ITEM' | 'EXPIRED_ITEM' | 'LOST_ITEM' | 'SYSTEM_CORRECTION';

export interface CountSessionLine {
  id: number;
  countId: number;
  itemId: number;
  sku: string;
  itemName: string;
  uom: string;
  binCode: string;
  batchNo: string;
  qtySystem: number; // Hidden during blind count in FE-602
  qtyCounted?: number;
  qtyVariance?: number;
  reasonCode?: AdjustmentReasonCode;
  notes?: string;
}

export interface CountSession {
  id: number;
  countNo: string;
  title: string;
  warehouseId: number;
  warehouseName: string;
  scope: CountScope;
  targetScopeDetail?: string; // e.g. "Zona A" or "Kelas A"
  status: CountSessionStatus;
  iraScore?: number; // Inventory Record Accuracy score (%)
  items: CountSessionLine[];
  createdBy: string;
  createdAt: string;
}

export const countSessionSchema = z.object({
  title: z.string().min(3, 'Judul sesi opname minimal 3 karakter'),
  warehouseId: z.number({ required_error: 'Gudang wajib dipilih' }),
  scope: z.enum(['full', 'zone', 'abc_class']),
  targetScopeDetail: z.string().optional(),
});

export const adjustmentFormSchema = z.object({
  warehouseId: z.number({ required_error: 'Gudang wajib dipilih' }),
  locationCode: z.string().min(1, 'Lokasi bin wajib dipilih'),
  itemId: z.number({ required_error: 'Barang SKU wajib dipilih' }),
  sku: z.string().min(1, 'Kode SKU wajib diisi'),
  itemName: z.string().min(1, 'Nama barang wajib diisi'),
  uom: z.string().min(1, 'Satuan wajib diisi'),
  batchNo: z.string().min(1, 'Nomor batch wajib diisi'),
  adjustmentType: z.enum(['plus', 'minus']),
  qty: z.number({ required_error: 'Jumlah penyesuaian wajib diisi' }).gt(0, 'Qty minimal 1'),
  reasonCode: z.enum(['COUNT_DISCREPANCY', 'DAMAGED_ITEM', 'EXPIRED_ITEM', 'LOST_ITEM', 'SYSTEM_CORRECTION'], {
    required_error: 'Kode alasan penyesuaian wajib dipilih',
  }),
  notes: z.string().min(3, 'Catatan justifikasi penyesuaian wajib diisi'),
});

export type CountSessionFormValues = z.infer<typeof countSessionSchema>;
export type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>;

export function getCountStatusTagColor(status: CountSessionStatus): { color: string; label: string } {
  switch (status) {
    case 'open':
      return { color: 'default', label: 'Sesi Baru (Open)' };
    case 'in_progress':
      return { color: 'processing', label: 'Proses Hitung Fisik' };
    case 'review':
      return { color: 'warning', label: 'Menunggu Rekonsiliasi' };
    case 'posted':
      return { color: 'success', label: 'Selesai & Diposting (Posted)' };
    case 'cancelled':
      return { color: 'error', label: 'Dibatalkan' };
    default:
      return { color: 'default', label: status };
  }
}

export const MOCK_COUNT_SESSIONS: CountSession[] = [
  {
    id: 1,
    countNo: 'SO-2026-08-001',
    title: 'Stock Opname Bulanan Zona A - Agustus 2026',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    scope: 'zone',
    targetScopeDetail: 'Zona A - Bahan Baku',
    status: 'in_progress',
    iraScore: 98.5,
    createdBy: 'Dipo Supervisor',
    createdAt: '2026-08-16 08:00:00',
    items: [
      {
        id: 101,
        countId: 1,
        itemId: 1,
        sku: 'SKU-PITA-001',
        itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
        uom: 'RIM',
        binCode: 'JKT01-Z1-R01-B01',
        batchNo: 'LOT-SIC-202608-01',
        qtySystem: 250,
        qtyCounted: 250,
        qtyVariance: 0,
      },
      {
        id: 102,
        countId: 1,
        itemId: 2,
        sku: 'SKU-TINTA-002',
        itemName: 'Tinta Cetak Sekuritas Siklamat Biru',
        uom: 'KG',
        binCode: 'JKT01-Z1-R01-B02',
        batchNo: 'LOT-PUR-2026-99',
        qtySystem: 80,
        qtyCounted: 78,
        qtyVariance: -2,
        reasonCode: 'DAMAGED_ITEM',
        notes: 'Kemasan kaleng tinta penyok dan bocor halus',
      },
    ],
  },
  {
    id: 2,
    countNo: 'SO-2026-08-002',
    title: 'Cycle Count Stok Kelas A (Fast Moving)',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    scope: 'abc_class',
    targetScopeDetail: 'Kelas A',
    status: 'posted',
    iraScore: 100.0,
    createdBy: 'Dipo Supervisor',
    createdAt: '2026-08-10 09:00:00',
    items: [
      {
        id: 103,
        countId: 2,
        itemId: 1,
        sku: 'SKU-PITA-001',
        itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
        uom: 'RIM',
        binCode: 'JKT01-Z1-R01-B01',
        batchNo: 'LOT-SIC-202608-01',
        qtySystem: 200,
        qtyCounted: 200,
        qtyVariance: 0,
      },
    ],
  },
];
