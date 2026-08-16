import { describe, it, expect } from 'vitest';
import { formatApiErrorMessage, ERROR_MESSAGES_ID } from '../api/errorMapper';
import { ApiErrorDetail } from '../api/types';

describe('ErrorMapper Utility', () => {
  it('translates standard error codes into Indonesian messages', () => {
    expect(formatApiErrorMessage({ code: 'ERR_STOCK_INSUFFICIENT', message: 'Insufficient stock' })).toBe(
      ERROR_MESSAGES_ID.ERR_STOCK_INSUFFICIENT
    );

    expect(formatApiErrorMessage({ code: 'ERR_SELF_APPROVAL', message: 'Maker checker error' })).toBe(
      ERROR_MESSAGES_ID.ERR_SELF_APPROVAL
    );

    expect(formatApiErrorMessage({ code: 'ERR_SCAN_MISMATCH', message: 'Scan mismatch' })).toBe(
      ERROR_MESSAGES_ID.ERR_SCAN_MISMATCH
    );
  });

  it('formats error details when available (e.g. requested vs available stock)', () => {
    const error: ApiErrorDetail = {
      code: 'ERR_STOCK_INSUFFICIENT',
      message: 'Stok tidak mencukupi',
      details: [
        { sku: 'SKU-001', requested: 100, available: 60 },
      ],
    };

    const formatted = formatApiErrorMessage(error);
    expect(formatted).toContain(ERROR_MESSAGES_ID.ERR_STOCK_INSUFFICIENT);
    expect(formatted).toContain('[SKU-001: Diminta 100, Tersedia 60]');
  });

  it('provides a fallback message when error object is null or has unknown code', () => {
    expect(formatApiErrorMessage(null)).toBe('Terjadi kesalahan yang tidak diketahui.');

    const unknownError: ApiErrorDetail = {
      code: 'ERR_UNKNOWN_XYZ',
      message: 'Custom backend message',
    };
    expect(formatApiErrorMessage(unknownError)).toBe('Custom backend message');
  });
});
