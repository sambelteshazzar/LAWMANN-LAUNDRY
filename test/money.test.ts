import { describe, expect, it } from 'vitest';
import {
  assertGrams,
  assertPesewas,
  ghs,
  grams,
  money,
  moneyShort,
  pesewas,
  plain,
  sum,
  weightEntry,
  weightLabel,
} from '@/lib/money';

describe('pesewas / grams guards', () => {
  it('rejects fractional pesewas', () => {
    expect(() => pesewas(1.5)).toThrow(RangeError);
    expect(() => pesewas(NaN)).toThrow(RangeError);
    expect(() => pesewas(Infinity)).toThrow(RangeError);
  });

  it('accepts whole floats that are integers', () => {
    expect(pesewas(2.0)).toBe(2);
  });

  it('rejects fractional grams', () => {
    expect(() => grams(3.5)).toThrow(RangeError);
  });

  it('assertPesewas and assertGrams reject non-numbers', () => {
    expect(() => assertPesewas('93', 'gross')).toThrow(TypeError);
    expect(() => assertPesewas(null, 'gross')).toThrow(TypeError);
    expect(() => assertGrams(3.5, 'weight')).toThrow(TypeError);
    expect(assertGrams(3500, 'weight')).toBe(3500);
  });
});

describe('formatting', () => {
  it('money renders two decimals with grouping', () => {
    expect(money(9300)).toBe('GH¢93.00');
    expect(money(7300)).toBe('GH¢73.00');
    expect(money(500)).toBe('GH¢5.00');
    expect(money(5)).toBe('GH¢0.05');
  });

  it('money renders negatives without touching the digits', () => {
    expect(money(-500)).toBe('-GH¢5.00');
  });

  it('money groups thousands', () => {
    expect(money(123456789)).toBe('GH¢1,234,567.89');
  });

  it('moneyShort drops pesewas for dashboards and SMS', () => {
    expect(moneyShort(12800)).toBe('GH¢128');
    expect(moneyShort(9300)).toBe('GH¢93');
    expect(moneyShort(50)).toBe('GH¢0');
  });

  it('plain is the two-decimal form without the symbol', () => {
    expect(plain(9300)).toBe('93.00');
  });

  it('ghs rounds safely from a decimal entry', () => {
    expect(ghs(93)).toBe(9300);
    expect(ghs(12.5)).toBe(1250);
    expect(() => ghs(Number.NaN)).toThrow(RangeError);
  });

  it('sum keeps integer pesewas', () => {
    expect(sum([7300, 9300, -500])).toBe(16100);
  });
});

describe('weight labels', () => {
  it('rounds in integer tenths of a kilo, not in float kilos', () => {
    expect(weightLabel(3050)).toBe('3.1kg');
  });

  it('drops a zero fraction', () => {
    expect(weightLabel(3000)).toBe('3kg');
    expect(weightLabel(0)).toBe('0kg');
  });

  it('weightEntry is the two-decimal price-list form', () => {
    expect(weightEntry(3500)).toBe('3.50kg');
  });
});
