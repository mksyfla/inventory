import { z } from 'zod';

export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'fulfilled'
  | 'cancelled';

export type RequestPriority = 'normal' | 'urgent';

export interface ItemRequestLine {
  id: number;
  itemId: number;
  sku: string;
  itemName: string;
  uom: string;
  qtyRequested: number;
  qtyApproved: number;
  notes?: string;
}

export interface ItemRequest {
  id: number;
  requestNo: string;
  requestingUnit: string;
  warehouseId: number;
  warehouseName: string;
  requiredDate: string;
  priority: RequestPriority;
  status: RequestStatus;
  notes?: string;
  rejectionReason?: string;
  createdByName: string;
  createdAt: string;
  items: ItemRequestLine[];
}

export const requestItemLineSchema = z.object({
  itemId: z.number().min(1, 'Pilih SKU barang'),
  sku: z.string().min(1, 'SKU wajib diisi'),
  itemName: z.string().min(1, 'Nama barang wajib diisi'),
  uom: z.string().min(1, 'Satuan UoM wajib diisi'),
  qtyRequested: z.number().min(1, 'Jumlah permintaan minimal 1'),
  qtyApproved: z.number().min(0, 'Qty disetujui tidak boleh negatif').optional(),
  notes: z.string().optional().nullable(),
});

export const requestFormSchema = z.object({
  requestingUnit: z.string().min(2, 'Nama Unit / Departemen Peminta wajib diisi'),
  warehouseId: z.number().min(1, 'Gudang Asal Barang wajib dipilih'),
  requiredDate: z.string().min(1, 'Tanggal Dibutuhkan wajib diisi'),
  priority: z.enum(['normal', 'urgent'], { required_error: 'Pilih prioritas permintaan' }),
  notes: z.string().optional().nullable(),
  items: z.array(requestItemLineSchema).min(1, 'Minimal tambahkan 1 baris SKU barang'),
});

export type RequestItemLineValues = z.infer<typeof requestItemLineSchema>;
export type RequestFormValues = z.infer<typeof requestFormSchema>;

export const getRequestStatusTagColor = (status: RequestStatus) => {
  switch (status) {
    case 'draft':
      return { color: 'default', label: 'Draft' };
    case 'submitted':
      return { color: 'processing', label: 'Diajukan' };
    case 'approved':
      return { color: 'blue', label: 'Disetujui' };
    case 'rejected':
      return { color: 'error', label: 'Ditolak' };
    case 'fulfilled':
      return { color: 'success', label: 'Terpenuhi (Fulfilled)' };
    case 'cancelled':
      return { color: 'warning', label: 'Dibatalkan' };
    default:
      return { color: 'default', label: status };
  }
};

export const MOCK_REQUEST_LIST: ItemRequest[] = [
  {
    id: 1,
    requestNo: 'REQ-2026-08-001',
    requestingUnit: 'Divisi Cetak Paspor & Dokumen Negara',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    requiredDate: '2026-08-20',
    priority: 'urgent',
    status: 'submitted',
    notes: 'Kebutuhan tinta cetak Intaglio untuk pesanan paspor Kemlu batch 4.',
    createdByName: 'Siti Aminah (Staff Operasional)',
    createdAt: '2026-08-14T08:00:00Z',
    items: [
      {
        id: 101,
        itemId: 1,
        sku: 'SKU-INK-001',
        itemName: 'Tinta Cetak Hitam Intaglio 1KG',
        uom: 'CAN',
        qtyRequested: 15,
        qtyApproved: 15,
        notes: 'Gunakan lot terbaru',
      },
      {
        id: 102,
        itemId: 2,
        sku: 'SKU-INK-002',
        itemName: 'Tinta Cetak Biru Intaglio 1KG',
        uom: 'CAN',
        qtyRequested: 10,
        qtyApproved: 10,
      },
    ],
  },
  {
    id: 2,
    requestNo: 'REQ-2026-08-002',
    requestingUnit: 'Divisi Cetak Pita Cukai & Meterai',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    requiredDate: '2026-08-25',
    priority: 'normal',
    status: 'approved',
    notes: 'Kebutuhan kertas sekuriti roll paspor.',
    createdByName: 'Rahmat Hidayat (Operator Produksi)',
    createdAt: '2026-08-13T14:20:00Z',
    items: [
      {
        id: 201,
        itemId: 3,
        sku: 'SKU-PPR-001',
        itemName: 'Kertas Sekuriti Roll 90GSM Paspor',
        uom: 'ROLL',
        qtyRequested: 5,
        qtyApproved: 5,
      },
    ],
  },
  {
    id: 3,
    requestNo: 'REQ-2026-08-003',
    requestingUnit: 'Divisi Logistik Cabang Karawang',
    warehouseId: 2,
    warehouseName: 'Gudang Cabang Karawang',
    requiredDate: '2026-08-18',
    priority: 'normal',
    status: 'draft',
    notes: 'Draft pengajuan kebutuhan bahan cetak umum.',
    createdByName: 'Budi Santoso',
    createdAt: '2026-08-14T09:10:00Z',
    items: [
      {
        id: 301,
        itemId: 1,
        sku: 'SKU-INK-001',
        itemName: 'Tinta Cetak Hitam Intaglio 1KG',
        uom: 'CAN',
        qtyRequested: 4,
        qtyApproved: 0,
      },
    ],
  },
];

/* Delivery Order (DO), Packing, POD, & Partial Tracker Types (FE-302 to FE-307) */

export type DeliveryStatus =
  | 'draft'
  | 'allocated'
  | 'picking_in_progress'
  | 'picked'
  | 'packed'
  | 'shipped'
  | 'partially_delivered'
  | 'delivered'
  | 'cancelled';

export interface StockAllocation {
  id: number;
  deliveryItemId: number;
  batchNo: string;
  expiryDate?: string;
  locationCode: string;
  qtyAllocated: number;
  isOverridden?: boolean;
  overrideReason?: string;
}

export interface DeliveryItemLine {
  id: number;
  itemId: number;
  sku: string;
  itemName: string;
  uom: string;
  qtyOrdered: number;
  qtyAllocated: number;
  qtyPicked: number;
  qtyPacked?: number;
  qtyDelivered?: number;
  qtyOutstanding?: number;
  allocations: StockAllocation[];
}

export interface PODData {
  receivedBy: string;
  receivedAt: string;
  signatureDataUrl?: string;
  photoUrl?: string;
  notes?: string;
}

export interface DeliveryOrder {
  id: number;
  doNo: string;
  requestNo?: string;
  customerName: string;
  destinationAddress: string;
  warehouseId: number;
  warehouseName: string;
  status: DeliveryStatus;
  deliveryDate: string;
  createdByName: string;
  createdAt: string;
  driverName?: string;
  vehiclePlateNo?: string;
  shippingNotes?: string;
  pod?: PODData;
  items: DeliveryItemLine[];
}

export const getDeliveryStatusTagColor = (status: DeliveryStatus) => {
  switch (status) {
    case 'draft':
      return { color: 'default', label: 'Draft DO' };
    case 'allocated':
      return { color: 'blue', label: 'Teralokasi FEFO' };
    case 'picking_in_progress':
      return { color: 'warning', label: 'Sedang Picking' };
    case 'picked':
      return { color: 'purple', label: 'Selesai Picking' };
    case 'packed':
      return { color: 'magenta', label: 'Terkemas (Packed)' };
    case 'shipped':
      return { color: 'processing', label: 'Dalam Pengiriman (Shipped)' };
    case 'partially_delivered':
      return { color: 'orange', label: 'Terkirim Sebagian (Partial)' };
    case 'delivered':
      return { color: 'success', label: 'Selesai Diterima (Delivered)' };
    case 'cancelled':
      return { color: 'error', label: 'Dibatalkan' };
    default:
      return { color: 'default', label: status };
  }
};

export const MOCK_DO_LIST: DeliveryOrder[] = [
  {
    id: 1,
    doNo: 'DO-2026-08-001',
    requestNo: 'REQ-2026-08-001',
    customerName: 'Kementerian Luar Negeri RI (Kemlu)',
    destinationAddress: 'Jl. Taman Pejambon No. 6, Jakarta Pusat',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    status: 'draft',
    deliveryDate: '2026-08-20',
    createdByName: 'Dipo (Inventory Manager)',
    createdAt: '2026-08-14T10:00:00Z',
    driverName: 'Sujono (Kurir Peruri)',
    vehiclePlateNo: 'B 9842 PQA',
    items: [
      {
        id: 1001,
        itemId: 1,
        sku: 'SKU-INK-001',
        itemName: 'Tinta Cetak Hitam Intaglio 1KG',
        uom: 'CAN',
        qtyOrdered: 15,
        qtyAllocated: 0,
        qtyPicked: 0,
        qtyPacked: 0,
        qtyDelivered: 0,
        qtyOutstanding: 15,
        allocations: [],
      },
      {
        id: 1002,
        itemId: 2,
        sku: 'SKU-INK-002',
        itemName: 'Tinta Cetak Biru Intaglio 1KG',
        uom: 'CAN',
        qtyOrdered: 10,
        qtyAllocated: 0,
        qtyPicked: 0,
        qtyPacked: 0,
        qtyDelivered: 0,
        qtyOutstanding: 10,
        allocations: [],
      },
    ],
  },
  {
    id: 2,
    doNo: 'DO-2026-08-002',
    requestNo: 'REQ-2026-08-002',
    customerName: 'Direktorat Jenderal Bea dan Cukai (DJBC)',
    destinationAddress: 'Kawasan Industri Peruri, Karawang',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    status: 'partially_delivered',
    deliveryDate: '2026-08-22',
    createdByName: 'Dipo (Inventory Manager)',
    createdAt: '2026-08-13T16:00:00Z',
    driverName: 'Bambang Supriadi',
    vehiclePlateNo: 'B 1234 PER',
    pod: {
      receivedBy: 'Ahmad Subagyo (Kepala Gudang Bea Cukai)',
      receivedAt: '2026-08-14T14:30:00Z',
      notes: '3 Roll Kertas diterima baik, 2 Roll outstanding pengiriman berikutnya.',
    },
    items: [
      {
        id: 2001,
        itemId: 3,
        sku: 'SKU-PPR-001',
        itemName: 'Kertas Sekuriti Roll 90GSM Paspor',
        uom: 'ROLL',
        qtyOrdered: 5,
        qtyAllocated: 5,
        qtyPicked: 5,
        qtyPacked: 5,
        qtyDelivered: 3,
        qtyOutstanding: 2,
        allocations: [
          {
            id: 5001,
            deliveryItemId: 2001,
            batchNo: 'LOT-PUR-2026-99',
            expiryDate: '2028-08-10',
            locationCode: 'JKT01-Z1-R01-B01',
            qtyAllocated: 5,
            isOverridden: false,
          },
        ],
      },
    ],
  },
];

/* Mobile Scanner Picking Types (FE-303) */

export interface PickingItemRow {
  id: number;
  deliveryItemId: number;
  pickSeq: number;
  targetBinCode: string;
  targetSku: string;
  itemName: string;
  targetBatchNo: string;
  uom: string;
  qtyToPick: number;
  qtyPicked: number;
  scannedBinCode: string;
  scannedSku: string;
  isBinMatched?: boolean;
  isSkuMatched?: boolean;
  isPickedCompleted: boolean;
}
