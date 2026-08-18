import { describe, it, expect } from 'vitest';
import { transferFormSchema } from '../types/transfer';

describe('TransferFormSchema Validation (EPIC-4)', () => {
  it('validates a valid transfer form values', () => {
    const validData = {
      originWarehouseId: 1,
      destinationWarehouseId: 2,
      transferDate: '2026-08-17',
      driverName: 'Sujono',
      vehiclePlateNo: 'B 9842 PQA',
      items: [
        {
          itemId: 1,
          sku: 'SKU-PITA-001',
          itemName: 'Pita Cukai',
          uom: 'RIM',
          batchNo: 'LOT-2026-001',
          qtySent: 10,
        },
      ],
    };

    const result = transferFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails validation when origin and destination warehouse are identical', () => {
    const invalidData = {
      originWarehouseId: 1,
      destinationWarehouseId: 1,
      transferDate: '2026-08-17',
      items: [
        {
          itemId: 1,
          sku: 'SKU-PITA-001',
          itemName: 'Pita Cukai',
          uom: 'RIM',
          batchNo: 'LOT-2026-001',
          qtySent: 10,
        },
      ],
    };

    const result = transferFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('destinationWarehouseId'));
      expect(issue).toBeDefined();
    }
  });
});
