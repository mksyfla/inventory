import Dexie, { Table } from 'dexie';

export interface DraftReceipt {
  id?: number;
  docNo: string;
  warehouseId: number;
  partnerId?: number;
  refPoNo?: string;
  lines: Array<{
    lineNo: number;
    itemId: number;
    uom: string;
    qtyRequest: number;
    batchNo?: string;
    expiryDate?: string;
    status: 'available' | 'quarantine' | 'damaged';
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface DraftPicking {
  id?: number;
  deliveryId: number;
  docNo: string;
  warehouseId: number;
  scans: Array<{
    allocationId: number;
    locationBarcode: string;
    itemBarcode: string;
    qty: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface DraftCount {
  id?: number;
  countSessionId: number;
  warehouseId: number;
  lines: Array<{
    itemId: number;
    locationId: number;
    batchId?: number;
    qtyCounted: number;
    reasonCode?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueItem {
  id?: number;
  idempotencyKey: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload: any;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  retryCount: number;
  createdAt: string;
}

export class SimbarOfflineDatabase extends Dexie {
  draftReceipts!: Table<DraftReceipt, number>;
  draftPickings!: Table<DraftPicking, number>;
  draftCounts!: Table<DraftCount, number>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('simbar_offline_db');

    this.version(1).stores({
      draftReceipts: '++id, docNo, warehouseId, createdAt, updatedAt',
      draftPickings: '++id, deliveryId, docNo, warehouseId, createdAt, updatedAt',
      draftCounts: '++id, countSessionId, warehouseId, createdAt, updatedAt',
      syncQueue: '++id, idempotencyKey, endpoint, method, status, createdAt',
    });
  }
}

export const offlineDb = new SimbarOfflineDatabase();
