import { describe, it, expect } from 'vitest';
import { itemSchema } from '../types/item';

describe('itemSchema Zod Validation & Constraints', () => {
  it('validates a correct item payload', () => {
    const validData = {
      sku: 'SKU-TEST-001',
      name: 'Tinta Cetak Sekuriti',
      categoryId: 2,
      baseUom: 'CAN',
      minQty: 10,
      maxQty: 100,
      safetyStock: 5,
      leadTimeDays: 7,
      abcClass: 'A' as const,
      isBatch: true,
      isExpiry: true,
      isSerial: false,
    };

    const result = itemSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('enforces constraint chk_expiry_needs_batch: fails when isExpiry is true but isBatch is false', () => {
    const invalidData = {
      sku: 'SKU-FAIL-001',
      name: 'Barang Expired Tanpa Batch',
      categoryId: 1,
      baseUom: 'PCS',
      minQty: 10,
      maxQty: 50,
      safetyStock: 2,
      leadTimeDays: 5,
      isBatch: false, // Invalid when isExpiry is true
      isExpiry: true,
      isSerial: false,
    };

    const result = itemSchema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('isBatch'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('wajib mengaktifkan pelacakan Batch');
    }
  });

  it('enforces constraint chk_max_gte_min: fails when maxQty is less than minQty', () => {
    const invalidData = {
      sku: 'SKU-FAIL-002',
      name: 'Batas Stok Terbalik',
      categoryId: 1,
      baseUom: 'PCS',
      minQty: 100,
      maxQty: 20, // Invalid: maxQty < minQty
      safetyStock: 10,
      leadTimeDays: 3,
      isBatch: false,
      isExpiry: false,
      isSerial: false,
    };

    const result = itemSchema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('maxQty'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('harus lebih besar atau sama dengan minimal stok');
    }
  });
});
