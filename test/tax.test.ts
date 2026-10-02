import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { grossUpForNet, splitTaxInclusive } from '@/lib/tax';
import { pesewas } from '@/lib/money';

/**
 * The highest-risk arithmetic in the app. These properties are the reason the
 * split can be trusted to file a return: the parts always foot to the invoice,
 * no part is ever off by more than one pesewa, and re-running a month never
 * reshuffles which component absorbs the residue.
 */
describe('splitTaxInclusive', () => {
  it('components always sum to exactly the total', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000_000, max: 10_000_000 }), (inclusive) => {
        const s = splitTaxInclusive(pesewas(inclusive));
        expect(s.base + s.vat + s.nhil + s.getfund).toBe(inclusive);
      }),
      { numRuns: 2000 },
    );
  });

  it('each component is within one pesewa of the exact fraction', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), (inclusive) => {
        const s = splitTaxInclusive(pesewas(inclusive));
        expect(Math.abs(s.vat - (inclusive * 1500) / 12000)).toBeLessThanOrEqual(1);
        expect(Math.abs(s.nhil - (inclusive * 250) / 12000)).toBeLessThanOrEqual(1);
        expect(Math.abs(s.getfund - (inclusive * 250) / 12000)).toBeLessThanOrEqual(1);
        expect(Math.abs(s.base - (inclusive * 10000) / 12000)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 2000 },
    );
  });

  it('is deterministic for every input', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (v) => {
        expect(splitTaxInclusive(pesewas(v))).toStrictEqual(splitTaxInclusive(pesewas(v)));
      }),
      { numRuns: 2000 },
    );
  });

  it('zero splits to all zeros', () => {
    const s = splitTaxInclusive(0);
    expect([s.base, s.vat, s.nhil, s.getfund, s.total]).toEqual([0, 0, 0, 0, 0]);
  });

  it('negative amounts keep the sign and still foot', () => {
    const s = splitTaxInclusive(pesewas(-7300));
    expect(s.base + s.vat + s.nhil + s.getfund).toBe(-7300);
    expect(s.base < 0 && s.vat < 0 && s.nhil < 0 && s.getfund < 0).toBe(true);
  });

  it('GH¢73, the minimum band, splits and foots', () => {
    const s = splitTaxInclusive(7300);
    expect(s.base + s.vat + s.nhil + s.getfund).toBe(7300);
  });

  it('grossUpForNet inverts: grossing up a net base recovers that base in the split', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 1_000_000 }), (net) => {
        const s = splitTaxInclusive(grossUpForNet(pesewas(net)));
        expect(Math.abs(s.base - net)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });
});
