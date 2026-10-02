import { describe, expect, it } from 'vitest';
import {
  BANDS,
  MAX_BANDED,
  PIECES,
  bandFor,
  perKgAt,
  quoteBand,
  quotePieces,
  thinnestBand,
} from '@/lib/pricing';
import { grams, pesewas } from '@/lib/money';

/**
 * The tariff as read from the poster, including the two recorded defects:
 * the band gaps are assumed to mean cumulative "up to" thresholds, and
 * nothing prices a bag above 15kg. These tests pin both assumptions so the
 * owner's written confirmation, when it comes, changes exactly one flag.
 */
describe('bandFor', () => {
  it('prices the gap weights under the assumed cumulative reading', () => {
    expect(bandFor(grams(3500))?.price).toBe(pesewas(9300));
    expect(bandFor(grams(6500))?.price).toBe(pesewas(10300));
    expect(bandFor(grams(9500))?.price).toBe(pesewas(12800));
    expect(bandFor(grams(12500))?.price).toBe(pesewas(19000));
  });

  it('prices the band edges exactly', () => {
    expect(bandFor(grams(3000))?.price).toBe(pesewas(7300));
    expect(bandFor(grams(3001))?.price).toBe(pesewas(9300));
    expect(bandFor(grams(15000))?.price).toBe(pesewas(19000));
  });

  it('refuses zero and refuses above the ceiling', () => {
    expect(bandFor(grams(0))).toBeNull();
    expect(bandFor(grams(15001))).toBeNull();
    expect(MAX_BANDED).toBe(grams(15000));
  });
});

describe('quoteBand', () => {
  it('quotes a 3.5kg bag at GH¢93 with the per-kilo report figure', () => {
    const q = quoteBand(grams(3500));
    expect(q.cannotPrice).toBeNull();
    expect(q.total).toBe(pesewas(9300));
    expect(q.perKg).toBe(pesewas(1550));
  });

  it('says the price list stops at 15kg rather than extrapolating', () => {
    const q = quoteBand(grams(16000));
    expect(q.cannotPrice).toContain('15kg');
    expect(q.total).toBe(0);
  });

  it('rejects a non-positive weight in words', () => {
    expect(quoteBand(grams(0)).cannotPrice).toContain('zero');
  });

  it('the thinnest band is 10-12kg at GH¢10.67 per kilo', () => {
    const worst = thinnestBand();
    expect(worst.band.label).toBe('10 to 12kg');
    expect(worst.perKg).toBe(pesewas(1067));
  });

  it('perKgAt rounds, never floors, the report figure', () => {
    expect(perKgAt(pesewas(7300), grams(3000))).toBe(pesewas(2433));
    expect(perKgAt(pesewas(10300), grams(9000))).toBe(pesewas(1144));
  });
});

describe('quotePieces', () => {
  it('sums quantities at the list price', () => {
    const q = quotePieces([
      { code: 'SHIRT', qty: 2 },
      { code: 'BEDSHEET', qty: 1 },
    ]);
    expect(q.total).toBe(pesewas(3600));
    expect(q.cannotPrice).toBeNull();
  });

  it('refuses unknown codes, zero quantities, and empty lines', () => {
    expect(quotePieces([{ code: 'NOPE', qty: 1 }]).cannotPrice).toContain('not on the price list');
    expect(quotePieces([{ code: 'SHIRT', qty: 0 }]).cannotPrice).toContain('at least one');
    expect(quotePieces([]).cannotPrice).toContain('No items');
  });

  it('the piece list is the poster, including the dry-clean flags', () => {
    expect(PIECES.filter((p) => p.mayBeDryClean).map((p) => p.code)).toEqual([
      'KAFTAN',
      'SUIT_2PC',
      'SMOCK',
      'SNEAKERS',
    ]);
    expect(BANDS).toHaveLength(5);
  });
});
