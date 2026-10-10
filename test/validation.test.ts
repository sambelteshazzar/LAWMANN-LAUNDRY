import { describe, expect, it } from 'vitest';
import {
  COST_CATEGORIES,
  correctionSchema,
  ghsToPesewas,
  intakeSchema,
  kgToGrams,
  normalizePhone,
  paymentSchema,
} from '@/lib/validation';

describe('normalizePhone', () => {
  it('keeps local numbers and unwraps +233', () => {
    expect(normalizePhone('0241234567')).toBe('0241234567');
    expect(normalizePhone('+233241234567')).toBe('0241234567');
    expect(normalizePhone('233241234567')).toBe('0241234567');
  });

  it('trims spacing and dashes people actually type', () => {
    expect(normalizePhone(' 024 123 4567 ')).toBe('0241234567');
    expect(normalizePhone('024-123-4567')).toBe('0241234567');
  });

  it('rejects junk, short, and non-Ghana forms', () => {
    expect(normalizePhone('241234567')).toBeNull();
    expect(normalizePhone('02412345')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('+441234567890')).toBeNull();
  });
});

describe('ghsToPesewas', () => {
  it('converts decimal GH¢ entry to integer pesewas exactly once', () => {
    expect(ghsToPesewas('93')).toBe(9300);
    expect(ghsToPesewas('93.5')).toBe(9350);
    expect(ghsToPesewas('0.05')).toBe(5);
    expect(ghsToPesewas(12.5)).toBe(1250);
  });

  it('refuses more than two decimals and negatives', () => {
    expect(ghsToPesewas('93.505')).toBeNull();
    expect(ghsToPesewas('-5')).toBeNull();
    expect(ghsToPesewas('abc')).toBeNull();
  });
});

describe('kgToGrams', () => {
  it('converts kilo entry to grams, accepting three decimals', () => {
    expect(kgToGrams('3.5')).toBe(3500);
    expect(kgToGrams('3.125')).toBe(3125);
    expect(kgToGrams(12)).toBe(12000);
  });

  it('refuses zero and junk', () => {
    expect(kgToGrams('0')).toBeNull();
    expect(kgToGrams('')).toBeNull();
    expect(kgToGrams('3.1234')).toBeNull();
  });
});

describe('intakeSchema', () => {
  const base = {
    orderId: '00000000-0000-4000-8000-000000000001',
    locationId: '00000000-0000-4000-8000-000000000002',
    phone: '+233241234567',
    weightKg: '3.5',
    method: 'band' as const,
    payment: null,
  };

  it('normalizes the phone and the weight on the way in', () => {
    const parsed = intakeSchema.parse(base);
    expect(parsed.phone).toBe('0241234567');
    expect(parsed.weightKg).toBe(3500);
  });

  it('rejects an impossible weight and a missing location', () => {
    expect(intakeSchema.safeParse({ ...base, weightKg: '5000' }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...base, locationId: 'not-a-uuid' }).success).toBe(false);
  });

  it('converts a cash payment amount to pesewas', () => {
    const parsed = intakeSchema.parse({ ...base, payment: { method: 'cash', amount: '46.50' } });
    expect(parsed.payment?.amount).toBe(4650);
  });
});

describe('paymentSchema', () => {
  const base = {
    orderId: '00000000-0000-4000-8000-000000000001',
    method: 'cash' as const,
    amount: '10',
  };

  it('cash needs no gateway ref', () => {
    expect(paymentSchema.safeParse(base).success).toBe(true);
  });

  it('momo without a transaction ref is rejected with the reason', () => {
    const result = paymentSchema.safeParse({ ...base, method: 'momo' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('MoMo transaction ref');
    }
  });
});

describe('cost categories', () => {
  it('are the nine the owner pays in real life', () => {
    expect([...COST_CATEGORIES]).toHaveLength(9);
    expect(COST_CATEGORIES).toContain('gas');
  });
});

describe('correctionSchema', () => {
  const base = {
    orderId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    method: 'band',
    weightKg: '2.9',
    phone: '0241234567',
    locationId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    note: 'scale slipped',
  };

  it('accepts a band correction and keeps the weight as typed', () => {
    const parsed = correctionSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.weightKg).toBe('2.9');
    expect(parsed.data.promisedOn).toBe('');
  });

  it('accepts a piece correction with a total and no weight', () => {
    const parsed = correctionSchema.safeParse({ ...base, method: 'piece', weightKg: undefined, totalGhs: '16' });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.totalGhs).toBe('16');
  });

  it('treats an empty promised date as no date', () => {
    const parsed = correctionSchema.safeParse({ ...base, promisedOn: '' });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.promisedOn).toBe('');
  });

  it('refuses a note too short to explain anything', () => {
    expect(correctionSchema.safeParse({ ...base, note: 'x' }).success).toBe(false);
  });

  it('refuses a bad phone and a bad promised date', () => {
    expect(correctionSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...base, promisedOn: '16/10/2026' }).success).toBe(false);
  });
});
