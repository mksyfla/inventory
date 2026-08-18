import { describe, it, expect, beforeEach } from 'vitest';
import { offlineDb } from '../db/offlineDb';

describe('Dexie IndexedDB (offlineDb)', () => {
  beforeEach(async () => {
    await offlineDb.draftReceipts.clear();
    await offlineDb.syncQueue.clear();
  });

  it('saves, retrieves, and deletes draft receipts in IndexedDB', async () => {
    const draftId = await offlineDb.draftReceipts.add({
      docNo: 'GRN/JKT01/2608/DRAFT01',
      warehouseId: 1,
      lines: [
        {
          lineNo: 1,
          itemId: 101,
          uom: 'BOX',
          qtyRequest: 50,
          status: 'available',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(draftId).toBeDefined();

    // Fetch draft from IndexedDB
    const saved = await offlineDb.draftReceipts.get(draftId);
    expect(saved).toBeDefined();
    expect(saved?.docNo).toBe('GRN/JKT01/2608/DRAFT01');
    expect(saved?.lines.length).toBe(1);

    // Delete draft
    await offlineDb.draftReceipts.delete(draftId);
    const deleted = await offlineDb.draftReceipts.get(draftId);
    expect(deleted).toBeUndefined();
  });

  it('queues offline mutation requests into syncQueue', async () => {
    const queueId = await offlineDb.syncQueue.add({
      idempotencyKey: 'idemp-uuid-12345',
      endpoint: '/receipts',
      method: 'POST',
      payload: { docNo: 'GRN-001' },
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });

    expect(queueId).toBeDefined();

    const pendingItems = await offlineDb.syncQueue.where('status').equals('pending').toArray();
    expect(pendingItems.length).toBe(1);
    expect(pendingItems[0].idempotencyKey).toBe('idemp-uuid-12345');
    expect(pendingItems[0].method).toBe('POST');
  });
});
