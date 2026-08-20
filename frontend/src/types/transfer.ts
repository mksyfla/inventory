import { z } from 'zod';

export type TransferStatus = 'draft' | 'in_transit' | 'received' | 'partial_received' | 'cancelled';

export interface StockTransferLine {
  id: number;
  transferId: number;
  itemId: number;
  sku: string;
  itemName: string;
  uom: string;
  batchNo: string;
  expiryDate?: string;
  qtySent: number;
  qtyReceived?: number;
  qtyVariance?: number;
  targetLocationCode?: string;
}

export interface StockTransfer {
  id: number;
  transferNo: string;
  transferDate: string;
  originWarehouseId: number;
  originWarehouseName: string;
  destinationWarehouseId: number;
  destinationWarehouseName: string;
  status: TransferStatus;
  notes?: string;
  driverName?: string;
  vehiclePlateNo?: string;
  discrepancyReason?: string;
  items: StockTransferLine[];
  createdBy: string;
  createdAt: string;
}

export const transferFormSchema = z
  .object({
    originWarehouseId: z.number({ required_error: 'Gudang asal wajib dipilih' }),
    destinationWarehouseId: z.number({ required_error: 'Gudang tujuan wajib dipilih' }),
    transferDate: z.string().min(1, 'Tanggal mutasi wajib diisi'),
    driverName: z.string().optional(),
    vehiclePlateNo: z.string().optional(),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          itemId: z.number({ required_error: 'Barang SKU wajib dipilih' }),
          sku: z.string().min(1, 'Kode SKU wajib diisi'),
          itemName: z.string().min(1, 'Nama barang wajib diisi'),
          uom: z.string().min(1, 'Satuan wajib diisi'),
          batchNo: z.string().min(1, 'Nomor batch/lot wajib diisi'),
          expiryDate: z.string().optional(),
          qtySent: z.number({ required_error: 'Jumlah dikirim wajib diisi' }).gt(0, 'Qty minimal 1'),
        })
      )
      .min(1, 'Minimal harus ada 1 item barang yang dimutasi'),
  })
  .refine((data) => data.originWarehouseId !== data.destinationWarehouseId, {
    message: 'Gudang asal dan gudang tujuan tidak boleh sama!',
    path: ['destinationWarehouseId'],
  });

export type TransferFormValues = z.infer<typeof transferFormSchema>;

export function getTransferStatusTagColor(status: TransferStatus): { color: string; label: string } {
  switch (status) {
    case 'draft':
      return { color: 'default', label: 'Draft' };
    case 'in_transit':
      return { color: 'processing', label: 'In-Transit (Dalam Pengiriman)' };
    case 'received':
      return { color: 'success', label: 'Selesai (Received)' };
    case 'partial_received':
      return { color: 'warning', label: 'Terapresiasi Sebagian (Selisih Transit)' };
    case 'cancelled':
      return { color: 'error', label: 'Dibatalkan' };
    default:
      return { color: 'default', label: status };
  }
}

export const MOCK_TRANSFER_LIST: StockTransfer[] = [
  {
    id: 1,
    transferNo: 'TRF-2026-08-001',
    transferDate: '2026-08-16',
    originWarehouseId: 1,
    originWarehouseName: 'Gudang Utama Jakarta',
    destinationWarehouseId: 2,
    destinationWarehouseName: 'Gudang Cabang Surabaya',
    status: 'in_transit',
    driverName: 'Sujono',
    vehiclePlateNo: 'B 9842 PQA',
    notes: 'Mutasi persediaan pita cukai reguler',
    createdBy: 'Dipo Inventory',
    createdAt: '2026-08-16 09:30:00',
    items: [
      {
        id: 101,
        transferId: 1,
        itemId: 1,
        sku: 'SKU-PITA-001',
        itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
        uom: 'RIM',
        batchNo: 'LOT-SIC-202608-01',
        expiryDate: '2027-08-10',
        qtySent: 50,
        qtyReceived: 50,
        qtyVariance: 0,
        targetLocationCode: 'SBY01-Z1-R01-B01',
      },
    ],
  },
  {
    id: 2,
    transferNo: 'TRF-2026-08-002',
    transferDate: '2026-08-17',
    originWarehouseId: 1,
    originWarehouseName: 'Gudang Utama Jakarta',
    destinationWarehouseId: 3,
    destinationWarehouseName: 'Gudang Kawasan Karawang',
    status: 'partial_received',
    driverName: 'Budi Santoso',
    vehiclePlateNo: 'B 1234 XYZ',
    notes: 'Penyusutan selisih 2 rim dalam perjalanan armada',
    discrepancyReason: 'Ditemukan kemasan fisik rusak akibat benturan di armada truk pengangkut',
    createdBy: 'Dipo Inventory',
    createdAt: '2026-08-17 11:00:00',
    items: [
      {
        id: 102,
        transferId: 2,
        itemId: 2,
        sku: 'SKU-TINTA-002',
        itemName: 'Tinta Cetak Sekuritas Siklamat Biru',
        uom: 'KG',
        batchNo: 'LOT-PUR-2026-99',
        expiryDate: '2028-08-10',
        qtySent: 20,
        qtyReceived: 18,
        qtyVariance: 2,
        targetLocationCode: 'KRW01-Z1-R01-B02',
      },
    ],
  },
];
