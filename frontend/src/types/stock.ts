export type StockStatus = 'available' | 'quarantine' | 'damaged' | 'expired' | 'in_transit';

export interface StockBalance {
  id: number;
  sku: string;
  itemName: string;
  categoryName: string;
  warehouseId: number;
  warehouseName: string;
  locationCode: string;
  batchNo: string;
  expiryDate?: string;
  status: StockStatus;
  qtyOnHand: number;
  qtyReserved: number;
  qtyAvailable: number;
  uom: string;
}

export type MovementType =
  | 'receipt'
  | 'issue'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment_plus'
  | 'adjustment_minus';

export interface StockMovement {
  id: number;
  movedAt: string;
  itemId: number;
  sku: string;
  itemName: string;
  movementType: MovementType;
  docNo: string;
  locationCode: string;
  batchNo: string;
  qtyIn: number;
  qtyOut: number;
  qtyAfter: number;
  uom: string;
  operatorName: string;
}

export type AuditAction = 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'LOGIN';

export interface AuditLog {
  id: number;
  timestamp: string;
  userName: string;
  action: AuditAction;
  entityName: string;
  entityId: string;
  ipAddress: string;
  requestId: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
}

export interface BatchTrace {
  batchNo: string;
  sku: string;
  itemName: string;
  supplierName: string;
  grnNo: string;
  receiptDate: string;
  totalQtyReceived: number;
  uom: string;
  deliveries: {
    doNo: string;
    customerName: string;
    deliveryDate: string;
    qtyDelivered: number;
  }[];
}

export function getStockStatusTagColor(status: StockStatus): { color: string; label: string } {
  switch (status) {
    case 'available':
      return { color: 'success', label: 'Tersedia (Available)' };
    case 'quarantine':
      return { color: 'warning', label: 'Karantina / QC' };
    case 'damaged':
      return { color: 'error', label: 'Rusak (Damaged)' };
    case 'expired':
      return { color: 'magenta', label: 'Kedaluwarsa (Expired)' };
    case 'in_transit':
      return { color: 'processing', label: 'In-Transit' };
    default:
      return { color: 'default', label: status };
  }
}

export const MOCK_STOCK_BALANCES: StockBalance[] = [
  {
    id: 1,
    sku: 'SKU-PITA-001',
    itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    categoryName: 'Pita Cukai',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    locationCode: 'JKT01-Z1-R01-B01',
    batchNo: 'LOT-SIC-202608-01',
    expiryDate: '2027-08-10',
    status: 'available',
    qtyOnHand: 250,
    qtyReserved: 50,
    qtyAvailable: 200,
    uom: 'RIM',
  },
  {
    id: 2,
    sku: 'SKU-TINTA-002',
    itemName: 'Tinta Cetak Sekuritas Siklamat Biru',
    categoryName: 'Tinta Cetak Sekuritas',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    locationCode: 'JKT01-Z1-R01-B02',
    batchNo: 'LOT-PUR-2026-99',
    expiryDate: '2028-08-10',
    status: 'quarantine',
    qtyOnHand: 80,
    qtyReserved: 0,
    qtyAvailable: 80,
    uom: 'KG',
  },
  {
    id: 3,
    sku: 'SKU-KERTAS-003',
    itemName: 'Kertas Banknote Uang Kertas Rp 100.000',
    categoryName: 'Kertas Sekuritas',
    warehouseId: 1,
    warehouseName: 'Gudang Utama Jakarta',
    locationCode: 'JKT01-STG-IN',
    batchNo: 'LOT-EXP-2026-05',
    expiryDate: '2026-09-01',
    status: 'expired',
    qtyOnHand: 15,
    qtyReserved: 0,
    qtyAvailable: 15,
    uom: 'REAM',
  },
];

export const MOCK_STOCK_MOVEMENTS: StockMovement[] = [
  {
    id: 1,
    movedAt: '2026-08-15 10:15:00',
    itemId: 1,
    sku: 'SKU-PITA-001',
    itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    movementType: 'receipt',
    docNo: 'GRN-2026-08-001',
    locationCode: 'JKT01-STG-IN',
    batchNo: 'LOT-SIC-202608-01',
    qtyIn: 300,
    qtyOut: 0,
    qtyAfter: 300,
    uom: 'RIM',
    operatorName: 'Ahmad Staff Inbound',
  },
  {
    id: 2,
    movedAt: '2026-08-16 14:30:00',
    itemId: 1,
    sku: 'SKU-PITA-001',
    itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
    movementType: 'issue',
    docNo: 'DO-2026-08-001',
    locationCode: 'JKT01-Z1-R01-B01',
    batchNo: 'LOT-SIC-202608-01',
    qtyIn: 0,
    qtyOut: 50,
    qtyAfter: 250,
    uom: 'RIM',
    operatorName: 'Budi Kurir Outbound',
  },
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 1,
    timestamp: '2026-08-17 11:30:22',
    userName: 'Dipo Inventory (Manager)',
    action: 'APPROVE',
    entityName: 'GoodsReceiptNote',
    entityId: 'GRN-2026-08-001',
    ipAddress: '192.168.1.45',
    requestId: 'req-uuid-984210',
    oldValue: { status: 'submitted' },
    newValue: { status: 'approved', approvedBy: 'Dipo Inventory' },
  },
  {
    id: 2,
    timestamp: '2026-08-17 10:15:05',
    userName: 'Ahmad Staf',
    action: 'CREATE',
    entityName: 'ItemRequest',
    entityId: 'REQ-2026-08-005',
    ipAddress: '192.168.1.88',
    requestId: 'req-uuid-112233',
    oldValue: null as any,
    newValue: { requestNo: 'REQ-2026-08-005', customerName: 'DJBC' },
  },
];

export const MOCK_BATCH_TRACE: BatchTrace = {
  batchNo: 'LOT-SIC-202608-01',
  sku: 'SKU-PITA-001',
  itemName: 'Pita Cukai Hasil Tembakau (CHT) 2026',
  supplierName: 'PT Pura Barutama (Supplier Pita)',
  grnNo: 'GRN-2026-08-001',
  receiptDate: '2026-08-15',
  totalQtyReceived: 300,
  uom: 'RIM',
  deliveries: [
    {
      doNo: 'DO-2026-08-001',
      customerName: 'Kantor Pengawasan Bea Cukai Kudus',
      deliveryDate: '2026-08-16',
      qtyDelivered: 50,
    },
    {
      doNo: 'DO-2026-08-002',
      customerName: 'Direktorat Jenderal Bea dan Cukai (DJBC)',
      deliveryDate: '2026-08-17',
      qtyDelivered: 50,
    },
  ],
};
