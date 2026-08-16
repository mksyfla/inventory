import { describe, it, expect } from 'vitest';
import { receiptFormSchema } from '../types/inbound';

describe('receiptFormSchema Zod Validation', () => {
  it('validates a correct GRN form payload', () => {
    const validData = {
      poReference: 'PO-2026-0999',
      supplierId: 1,
      warehouseId: 1,
      receiptDate: '2026-08-14',
      notes: 'Penerimaan fisik lengkap',
      items: [
        {
          itemId: 1,
          sku: 'SKU-INK-001',
          itemName: 'Tinta Cetak Hitam Intaglio 1KG',
          uom: 'CAN',
          qtyExpected: 10,
          qtyReceived: 10,
          qtyRejected: 0,
          isExpiry: true,
          batchNo: 'LOT-2026-01',
          expiryDate: '2027-08-14',
          targetLocationCode: 'JKT01-Z1-R01-B01',
        },
      ],
    };

    const result = receiptFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails validation when items array is empty', () => {
    const invalidData = {
      poReference: 'PO-2026-0999',
      supplierId: 1,
      warehouseId: 1,
      receiptDate: '2026-08-14',
      items: [], // Empty!
    };

    const result = receiptFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('items'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Minimal tambahkan 1 baris SKU barang');
    }
  });

  it('fails validation when isExpiry is true but batchNo or expiryDate is missing', () => {
    const invalidData = {
      poReference: 'PO-2026-0999',
      supplierId: 1,
      warehouseId: 1,
      receiptDate: '2026-08-14',
      items: [
        {
          itemId: 1,
          sku: 'SKU-INK-001',
          itemName: 'Tinta Cetak Hitam Intaglio 1KG',
          uom: 'CAN',
          qtyExpected: 10,
          qtyReceived: 10,
          qtyRejected: 0,
          isExpiry: true,
          batchNo: '', // Missing batch!
          expiryDate: '', // Missing expiry!
        },
      ],
    };

    const result = receiptFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
