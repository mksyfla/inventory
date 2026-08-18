import { describe, it, expect } from 'vitest';
import { requestFormSchema } from '../types/outbound';

describe('requestFormSchema Zod Validation', () => {
  it('validates a correct item request form payload', () => {
    const validData = {
      requestingUnit: 'Divisi Cetak Paspor',
      warehouseId: 1,
      requiredDate: '2026-08-25',
      priority: 'urgent' as const,
      notes: 'Permintaan mendesak proyek Kemlu',
      items: [
        {
          itemId: 1,
          sku: 'SKU-INK-001',
          itemName: 'Tinta Cetak Hitam Intaglio 1KG',
          uom: 'CAN',
          qtyRequested: 10,
          notes: 'Batch terbaru',
        },
      ],
    };

    const result = requestFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails validation when requestingUnit is too short', () => {
    const invalidData = {
      requestingUnit: 'A', // Too short!
      warehouseId: 1,
      requiredDate: '2026-08-25',
      priority: 'normal' as const,
      items: [
        {
          itemId: 1,
          sku: 'SKU-INK-001',
          itemName: 'Tinta Cetak Hitam Intaglio 1KG',
          uom: 'CAN',
          qtyRequested: 5,
        },
      ],
    };

    const result = requestFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('fails validation when items array is empty', () => {
    const invalidData = {
      requestingUnit: 'Divisi Cetak Paspor',
      warehouseId: 1,
      requiredDate: '2026-08-25',
      priority: 'normal' as const,
      items: [], // Empty!
    };

    const result = requestFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('items'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Minimal tambahkan 1 baris SKU barang');
    }
  });
});
