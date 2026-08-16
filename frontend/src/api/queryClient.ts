import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds default for master data caching
      gcTime: 5 * 60 * 1000, // 5 minutes cache garbage collection time
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // Do not retry on client/business errors (401, 403, 404, 409, 422)
        const nonRetryableCodes = [
          'ERR_UNAUTHENTICATED',
          'ERR_FORBIDDEN',
          'ERR_NOT_FOUND',
          'ERR_VALIDATION',
          'ERR_STOCK_INSUFFICIENT',
          'ERR_SELF_APPROVAL',
          'ERR_SCAN_MISMATCH',
        ];
        if (error && nonRetryableCodes.includes(error.code)) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
