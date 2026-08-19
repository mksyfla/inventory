import { z } from 'zod';

export type DocStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface ReceiptItemLine {
  id: number;
  itemId: number;
  sku: string;
  itemName: string;
  uom: string;
  qtyExpected: number;
  qtyReceived: number;
  qtyRejected: number;
  isExpiry?: boolean;
  batchNo?: string;
  expiryDate?: string;
  targetLocationCode?: string;
}

export interface GoodsReceiptNote {
  id: number;
  documentNo: string;
  poReference: string;
  supplierId: number;
  supplierName: string;
  warehouseId: number;
  warehouseName: string;
  receiptDate: string;
  status: DocStatus;
  notes?: string;
  createdByName: string;
  createdAt: string;
  /** Line count from the list endpoint (items array is empty on list rows). */
  lineCount?: number;
  items: ReceiptItemLine[];
}

export const receiptItemLineSchema = z
  .object({
    itemId: z.number().min(1, 'Pilih SKU barang'),
    sku: z.string().min(1, 'SKU wajib diisi'),
    itemName: z.string().min(1, 'Nama barang wajib diisi'),
    uom: z.string().min(1, 'Satuan UoM wajib diisi'),
    qtyExpected: z.number().min(1, 'Qty PO minimal 1'),
    qtyReceived: z.number().min(0, 'Qty diterima tidak boleh negatif'),
    qtyRejected: z.number().min(0, 'Qty ditolak tidak boleh negatif'),
    isExpiry: z.boolean().optional(),
    batchNo: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    targetLocationCode: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.isExpiry) {
      if (!data.batchNo || data.batchNo.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['batchNo'],
          message: 'Nomor Batch wajib diisi untuk barang bertanggal kedaluwarsa',
        });
      }
      if (!data.expiryDate || data.expiryDate.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expiryDate'],
          message: 'Tanggal Kedaluwarsa wajib diisi',
        });
      }
    }

    if (data.qtyReceived + data.qtyRejected > data.qtyExpected * 1.2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['qtyReceived'],
        message: 'Total Qty Fisik melebihi batas toleransi PO (Maksimal +20%)',
      });
    }
  });

export const receiptFormSchema = z.object({
  poReference: z.string().min(3, 'Nomor referensi PO minimal 3 karakter'),
  supplierId: z.number().min(1, 'Pemasok (Supplier) wajib dipilih'),
  warehouseId: z.number().min(1, 'Gudang Tujuan wajib dipilih'),
  receiptDate: z.string().min(1, 'Tanggal penerimaan wajib diisi'),
  notes: z.string().optional().nullable(),
  items: z.array(receiptItemLineSchema).min(1, 'Minimal tambahkan 1 baris SKU barang'),
});

export type ReceiptItemLineValues = z.infer<typeof receiptItemLineSchema>;
export type ReceiptFormValues = z.infer<typeof receiptFormSchema>;

export const getDocStatusTagColor = (status: DocStatus) => {
  switch (status) {
    case 'draft':
      return { color: 'default', label: 'Draft' };
    case 'submitted':
      return { color: 'processing', label: 'Diajukan (Submitted)' };
    case 'approved':
      return { color: 'blue', label: 'Disetujui (Approved)' };
    case 'in_progress':
      return { color: 'warning', label: 'Sedang Putaway (In Progress)' };
    case 'completed':
      return { color: 'success', label: 'Selesai (Completed)' };
    case 'cancelled':
      return { color: 'error', label: 'Dibatalkan (Cancelled)' };
    default:
      return { color: 'default', label: status };
  }
};

export const MOCK_GRN_LIST: GoodsReceiptNote[] = [
  {
    id: 1,
    documentNo: 'GRN-2026-08-001',
    poReference: 'PO-2026-0102',
    supplierId: 1,
    supplierName: 'PT SICPA Perdana Printing Inks',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    receiptDate: '2026-08-10',
    status: 'completed',
    notes: 'Penerimaan tinta cetak Intaglio sesuai standar QC.',
    createdByName: 'Budi Santoso (Admin Gudang)',
    createdAt: '2026-08-10T09:00:00Z',
    items: [
      {
        id: 101,
        itemId: 1,
        sku: 'SKU-INK-001',
        itemName: 'Tinta Cetak Hitam Intaglio 1KG',
        uom: 'CAN',
        qtyExpected: 50,
        qtyReceived: 50,
        qtyRejected: 0,
        batchNo: 'LOT-SIC-202608-01',
        expiryDate: '2027-08-10',
        targetLocationCode: 'JKT01-Z1-R01-B01',
      },
      {
        id: 102,
        itemId: 2,
        sku: 'SKU-INK-002',
        itemName: 'Tinta Cetak Biru Intaglio 1KG',
        uom: 'CAN',
        qtyExpected: 30,
        qtyReceived: 30,
        qtyRejected: 0,
        batchNo: 'LOT-SIC-202608-02',
        expiryDate: '2027-08-10',
        targetLocationCode: 'JKT01-Z1-R01-B02',
      },
    ],
  },
  {
    id: 2,
    documentNo: 'GRN-2026-08-002',
    poReference: 'PO-2026-0108',
    supplierId: 2,
    supplierName: 'PT Pura Barutama (Paper Division)',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    receiptDate: '2026-08-12',
    status: 'submitted',
    notes: 'Penerimaan kertas sekuriti roll paspor.',
    createdByName: 'Budi Santoso (Admin Gudang)',
    createdAt: '2026-08-12T14:30:00Z',
    items: [
      {
        id: 201,
        itemId: 3,
        sku: 'SKU-PPR-001',
        itemName: 'Kertas Sekuriti Roll 90GSM Paspor',
        uom: 'ROLL',
        qtyExpected: 20,
        qtyReceived: 18,
        qtyRejected: 2,
        batchNo: 'LOT-PUR-2026-99',
        targetLocationCode: 'JKT01-STG-IN',
      },
    ],
  },
  {
    id: 3,
    documentNo: 'GRN-2026-08-003',
    poReference: 'PO-2026-0115',
    supplierId: 1,
    supplierName: 'PT SICPA Perdana Printing Inks',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    receiptDate: '2026-08-13',
    status: 'draft',
    notes: 'Draft penerimaan pasokan bahan kimia tambahan.',
    createdByName: 'Siti Aminah (Operator Receipt)',
    createdAt: '2026-08-13T10:00:00Z',
    items: [
      {
        id: 301,
        itemId: 1,
        sku: 'SKU-INK-001',
        itemName: 'Tinta Cetak Hitam Intaglio 1KG',
        uom: 'CAN',
        qtyExpected: 10,
        qtyReceived: 0,
        qtyRejected: 0,
      },
    ],
  },
];
