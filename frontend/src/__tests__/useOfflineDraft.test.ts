import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useOfflineDraft } from '../hooks/useOfflineDraft';
import { offlineDb } from '../db/offlineDb';

describe('useOfflineDraft Custom Hook', () => {
  beforeEach(async () => {
    await offlineDb.draftReceipts.clear();
    await offlineDb.syncQueue.clear();
  });

  it('monitors online and offline network status events', () => {
    const { result } = renderHook(() => useOfflineDraft());

    expect(result.current.isOnline).toBe(true);

    // Dispatch offline event
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);

    // Dispatch online event
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOnline).toBe(true);
  });

  it('saves draft receipt and retrieves drafts by warehouseId', async () => {
    const { result } = renderHook(() => useOfflineDraft());

    let savedId = 0;
    await act(async () => {
      savedId = await result.current.saveDraftReceipt({
        docNo: 'GRN/BDG01/2608/DRAFT02',
        warehouseId: 2,
        lines: [],
      });
    });

    expect(savedId).toBeGreaterThan(0);

    let drafts: any[] = [];
    await act(async () => {
      drafts = await result.current.getDraftReceipts(2);
    });

    expect(drafts.length).toBe(1);
    expect(drafts[0].docNo).toBe('GRN/BDG01/2608/DRAFT02');
  });
});
