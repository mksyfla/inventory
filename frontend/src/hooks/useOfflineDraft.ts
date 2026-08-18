import { useState, useEffect } from 'react';
import { offlineDb, DraftReceipt } from '../db/offlineDb';
import { generateUUID } from '../utils/uuid';

export function useOfflineDraft() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save or update draft receipt in IndexedDB
  const saveDraftReceipt = async (draft: Omit<DraftReceipt, 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const existing = draft.id ? await offlineDb.draftReceipts.get(draft.id) : null;

    if (existing) {
      await offlineDb.draftReceipts.update(draft.id!, {
        ...draft,
        updatedAt: now,
      });
      return draft.id!;
    }

    return await offlineDb.draftReceipts.add({
      ...draft,
      createdAt: now,
      updatedAt: now,
    });
  };

  // Get all draft receipts for active warehouse
  const getDraftReceipts = async (warehouseId?: number) => {
    if (warehouseId) {
      return await offlineDb.draftReceipts.where('warehouseId').equals(warehouseId).toArray();
    }
    return await offlineDb.draftReceipts.toArray();
  };

  // Delete draft receipt
  const deleteDraftReceipt = async (id: number) => {
    await offlineDb.draftReceipts.delete(id);
  };

  // Add mutation to offline sync queue
  const addToSyncQueue = async (
    endpoint: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    payload: any,
    customIdempotencyKey?: string
  ) => {
    const idempotencyKey = customIdempotencyKey || generateUUID();
    const now = new Date().toISOString();

    return await offlineDb.syncQueue.add({
      idempotencyKey,
      endpoint,
      method,
      payload,
      status: 'pending',
      retryCount: 0,
      createdAt: now,
    });
  };

  // Get all pending sync queue items
  const getPendingSyncQueue = async () => {
    return await offlineDb.syncQueue.where('status').equals('pending').toArray();
  };

  return {
    isOnline,
    saveDraftReceipt,
    getDraftReceipts,
    deleteDraftReceipt,
    addToSyncQueue,
    getPendingSyncQueue,
  };
}
