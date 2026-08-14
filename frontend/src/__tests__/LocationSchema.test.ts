import { describe, it, expect } from 'vitest';
import { locationSchema } from '../types/location';

describe('locationSchema Zod Validation', () => {
  it('validates a correct location payload', () => {
    const validData = {
      code: 'JKT01-Z1-R01-B01',
      name: 'Bin A1-01',
      type: 'bin' as const,
      parentId: 101,
      capacityVolumeM3: 2.5,
      capacityWeightKg: 500,
      isActive: true,
      isLocked: false,
    };

    const result = locationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails when capacity values are non-positive (<= 0)', () => {
    const invalidData = {
      code: 'JKT01-Z1-R01-B02',
      name: 'Bin A1-02',
      type: 'bin' as const,
      capacityVolumeM3: 0, // Invalid: must be > 0
      capacityWeightKg: -100, // Invalid: must be > 0
      isActive: true,
      isLocked: false,
    };

    const result = locationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
