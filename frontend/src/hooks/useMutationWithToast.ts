import { useMutation, QueryKey, UseMutationOptions } from '@tanstack/react-query';
import { notification } from 'antd';
import { queryClient } from '../api/queryClient';

export interface MutationWithToastOptions<TData = any, TVariables = any, TError = any> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  successTitle?: string;
  successMessage?: string;
  invalidateKeys?: QueryKey[];
  onSuccess?: (data: TData, variables: TVariables, context: unknown) => void;
  onError?: (error: TError, variables: TVariables, context: unknown) => void;
  options?: Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'>;
}

export function useMutationWithToast<TData = any, TVariables = any, TError = any>({
  mutationFn,
  successTitle = 'Berhasil Memproses Data',
  successMessage = 'Transaksi atau perubahan data berhasil disimpan.',
  invalidateKeys = [],
  onSuccess,
  onError,
  options,
}: MutationWithToastOptions<TData, TVariables, TError>) {
  return useMutation<TData, TError, TVariables>({
    mutationFn,
    onSuccess: (data, variables, context) => {
      // Show success notification card
      if (successMessage) {
        notification.success({
          message: successTitle,
          description: successMessage,
          placement: 'topRight',
          duration: 4,
        });
      }

      // Invalidate relevant query keys
      if (invalidateKeys && invalidateKeys.length > 0) {
        invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }

      if (onSuccess) {
        onSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      if (onError) {
        onError(error, variables, context);
      }
    },
    ...options,
  });
}
