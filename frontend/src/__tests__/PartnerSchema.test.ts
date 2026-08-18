import { describe, it, expect } from 'vitest';
import { partnerSchema } from '../types/partner';

describe('partnerSchema Zod Validation', () => {
  it('validates a correct partner payload', () => {
    const validData = {
      code: 'SUP-INK-01',
      name: 'PT SICPA Perdana Printing Inks',
      type: 'supplier' as const,
      address: 'Kawasan Industri Pulogadung',
      contactPerson: 'Bpk. Hendra',
      phone: '021-4601234',
      email: 'sales@sicpa.co.id',
      isActive: true,
    };

    const result = partnerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails when email format is invalid', () => {
    const invalidData = {
      code: 'SUP-FAIL-01',
      name: 'Supplier Email Invalid',
      type: 'supplier' as const,
      email: 'invalid-email-format',
      isActive: true,
    };

    const result = partnerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('email'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Format email tidak valid');
    }
  });
});
