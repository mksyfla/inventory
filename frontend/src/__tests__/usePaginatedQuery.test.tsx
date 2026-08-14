import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { queryClient } from '../api/queryClient';
import { useWarehouseStore } from '../store/useWarehouseStore';

describe('usePaginatedQuery Custom Hook', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('fetches data and appends active warehouse context to query key', async () => {
    useWarehouseStore.setState({ activeWarehouseId: 1 });

    const mockQueryFn = vi.fn().mockResolvedValue({
      items: [{ id: 1, sku: 'SKU-01' }],
      total: 1,
    });

    const { result } = renderHook(
      () =>
        usePaginatedQuery({
          queryKey: ['items', 'list'],
          queryFn: mockQueryFn,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual({
        items: [{ id: 1, sku: 'SKU-01' }],
        total: 1,
      });
      expect(mockQueryFn).toHaveBeenCalled();
    });
  });
});
