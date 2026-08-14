export type ApiErrorCode =
  | 'ERR_VALIDATION'
  | 'ERR_UNAUTHENTICATED'
  | 'ERR_FORBIDDEN'
  | 'ERR_NOT_FOUND'
  | 'ERR_STOCK_INSUFFICIENT'
  | 'ERR_INVALID_STATE'
  | 'ERR_SELF_APPROVAL'
  | 'ERR_SCAN_MISMATCH'
  | 'ERR_DUPLICATE_KEY'
  | 'ERR_EXPIRED_STOCK'
  | 'ERR_CONFLICT_VERSION'
  | 'ERR_INTERNAL';

export interface ApiErrorDetail {
  code: ApiErrorCode | string;
  message: string;
  details?: Array<{
    field?: string;
    sku?: string;
    requested?: number;
    available?: number;
    [key: string]: any;
  }>;
  request_id?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  meta?: {
    page_size?: number;
    next_cursor?: string;
    total_items?: number;
  };
  error: ApiErrorDetail | null;
}
