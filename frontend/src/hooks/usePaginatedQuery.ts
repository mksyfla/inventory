import { useQuery, keepPreviousData, QueryKey, UseQueryOptions } from '@tanstack/react-query';
import { useWarehouseStore } from '../store/useWarehouseStore';

export interface PaginatedQueryParams<TQueryFnData = any> {
  queryKey: QueryKey;
  queryFn: () => Promise<TQueryFnData>;
  staleTime?: number;
  enabled?: boolean;
  options?: Omit<UseQueryOptions<TQueryFnData, any, TQueryFnData, QueryKey>, 'queryKey' | 'queryFn'>;
}

export function usePaginatedQuery<TData = any>({
  queryKey,
  queryFn,
  staleTime,
  enabled = true,
  options,
}: PaginatedQueryParams<TData>) {
  const activeWarehouseId = useWarehouseStore((state) => state.activeWarehouseId);

  // Append activeWarehouseId to query key to automatically invalidate/refetch when warehouse context changes
  const fullQueryKey: QueryKey = [...queryKey, { warehouseId: activeWarehouseId }];

  const query = useQuery<TData, any>({
    queryKey: fullQueryKey,
    queryFn,
    staleTime,
    enabled,
    placeholderData: keepPreviousData,
    ...options,
  });

  return {
    ...query,
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}
