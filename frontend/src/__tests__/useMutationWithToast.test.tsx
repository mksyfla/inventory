import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useMutationWithToast } from '../hooks/useMutationWithToast';
import { queryClient } from '../api/queryClient';

describe('useMutationWithToast Custom Hook', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('executes mutation function and triggers success callback and query invalidation', async () => {
    const mockMutationFn = vi.fn().mockResolvedValue({ success: true, id: 101 });
    const mockOnSuccess = vi.fn();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useMutationWithToast({
          mutationFn: mockMutationFn,
          successTitle: 'Berhasil Simpan',
          successMessage: 'Data telah tersimpan',
          invalidateKeys: [['items']],
          onSuccess: mockOnSuccess,
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.mutate({ name: 'New Item' });
    });

    await waitFor(() => {
      expect(mockMutationFn.mock.calls[0][0]).toEqual({ name: 'New Item' });
      expect(mockOnSuccess).toHaveBeenCalledWith({ success: true, id: 101 }, { name: 'New Item' }, undefined);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['items'] });
    });
  });
});
