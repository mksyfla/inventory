import { describe, it, expect } from 'vitest';
import { rejectReasonSchema } from '../components/inbound/RejectReasonModal';

describe('rejectReasonSchema Zod Validation', () => {
  it('validates a correct rejection payload', () => {
    const validData = {
      reasonCode: 'damaged_goods' as const,
      notes: 'Kemasan kaleng tinta penyok saat pembongkaran.',
    };

    const result = rejectReasonSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails validation when reasonCode is "other" but notes is shorter than 5 characters', () => {
    const invalidData = {
      reasonCode: 'other' as const,
      notes: 'abc', // Too short!
    };

    const result = rejectReasonSchema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('notes'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Catatan wajib diisi minimal 5 karakter');
    }
  });
});
