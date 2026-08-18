import { describe, it, expect } from 'vitest';
import { overrideAllocationSchema } from '../components/outbound/OverrideAllocationModal';

describe('overrideAllocationSchema Zod Validation', () => {
  it('validates a correct override allocation payload', () => {
    const validData = {
      alternativeBatchNo: 'LOT-ALT-2026-999',
      alternativeLocationCode: 'JKT01-Z1-R02-B05',
      reasonCode: 'physical_damage' as const,
      notes: 'Kemasan kaleng penyok pada batch FEFO rekomendasi',
    };

    const result = overrideAllocationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails validation when notes is shorter than 5 characters', () => {
    const invalidData = {
      alternativeBatchNo: 'LOT-ALT-2026-999',
      alternativeLocationCode: 'JKT01-Z1-R02-B05',
      reasonCode: 'physical_damage' as const,
      notes: 'abc', // Too short!
    };

    const result = overrideAllocationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('notes'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('minimal 5 karakter');
    }
  });
});
