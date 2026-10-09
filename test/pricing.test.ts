import { describe, expect, it } from 'vitest';
import {
  BANDS,
  GAP_SURCHARGE,
  MAX_BANDED,
  MAX_PRICED,
  PIECES,
  TARIFF_ROWS,
  bandFor,
  gapRowLabel,
  perKgAt,
  priceAgainstBands,
  quoteBand,
  quotePieces,
  thinnestBand,
} from '@/lib/pricing';
import { grams, pesewas } from '@/lib/money';

/**
 * The tariff with the owner's gap rule: a reading between bands prices at
 * the band below it plus GH¢5; a decimal inside a band range stays at the
 * band price; 16.0kg and above still has no price.
 */
describe('bandFor', () => {
  it('reads a gap weight as the band below it, not the band above', () => {
    expect(bandFor(grams(3500))?.price).toBe(pesewas(7300));
    expect(bandFor(grams(6500))?.price).toBe(pesewas(9300));
    expect(bandFor(grams(9500))?.price).toBe(pesewas(10300));
    expect(bandFor(grams(12500))?.price).toBe(pesewas(12800));
    expect(bandFor(grams(15500))?.price).toBe(pesewas(19000));
  });

  it('prices the band edges exactly', () => {
    expect(bandFor(grams(3000))?.price).toBe(pesewas(7300));
    expect(bandFor(grams(3001))?.price).toBe(pesewas(7300));
    expect(bandFor(grams(4000))?.price).toBe(pesewas(9300));
    expect(bandFor(grams(15000))?.price).toBe(pesewas(19000));
  });

  it('keeps a decimal inside a band range at that band', () => {
    expect(bandFor(grams(2500))?.price).toBe(pesewas(7300));
    expect(bandFor(grams(4500))?.price).toBe(pesewas(9300));
    expect(bandFor(grams(11500))?.price).toBe(pesewas(12800));
  });

  it('refuses zero and refuses above the ceiling', () => {
    expect(bandFor(grams(0))).toBeNull();
    expect(bandFor(grams(16000))).toBeNull();
    expect(MAX_BANDED).toBe(grams(15000));
    expect(MAX_PRICED).toBe(grams(15900));
  });
});

describe('quoteBand', () => {
  it('quotes a 3.5kg gap bag at the band price plus GH¢5', () => {
    const q = quoteBand(grams(3500));
    expect(q.cannotPrice).toBeNull();
    expect(q.total).toBe(pesewas(7800));
    expect(q.band?.label).toBe('0 to 3kg');
    // Thinnest margin inside the gap, at its 3.9kg top.
    expect(q.perKg).toBe(pesewas(2000));
  });

  it('keeps a decimal inside a band range at the band price', () => {
    expect(quoteBand(grams(2500)).total).toBe(pesewas(7300));
    expect(quoteBand(grams(4500)).total).toBe(pesewas(9300));
    expect(quoteBand(grams(11500)).total).toBe(pesewas(12800));
  });

  it('quotes the top band\'s gap too', () => {
    expect(quoteBand(grams(15500)).total).toBe(pesewas(19000) + GAP_SURCHARGE);
  });

  it('says the price list stops at 15.9kg rather than extrapolating', () => {
    const q = quoteBand(grams(16000));
    expect(q.cannotPrice).toContain('15.9kg');
    expect(q.total).toBe(0);
  });

  it('rejects a non-positive weight in words', () => {
    expect(quoteBand(grams(0)).cannotPrice).toContain('zero');
  });

  it('the thinnest row is the 12.1 – 12.9kg gap at GH¢10.31 per kilo', () => {
    const worst = thinnestBand();
    expect(worst.label).toBe('12.1 – 12.9kg');
    expect(worst.perKg).toBe(pesewas(1031));
  });

  it('perKgAt rounds, never floors, the report figure', () => {
    expect(perKgAt(pesewas(7300), grams(3000))).toBe(pesewas(2433));
    expect(perKgAt(pesewas(10300), grams(9000))).toBe(pesewas(1144));
  });
});

describe('priceAgainstBands', () => {
  const rows = BANDS.map((b) => ({ toGrams: b.to, pricePesewa: b.price }));

  it('prices against a cumulative band table like the database stores', () => {
    expect(priceAgainstBands(rows, grams(2000))).toEqual({ price: pesewas(7300) });
    expect(priceAgainstBands(rows, grams(3500))).toEqual({ price: pesewas(7800) });
    expect(priceAgainstBands(rows, grams(4500))).toEqual({ price: pesewas(9300) });
    expect(priceAgainstBands(rows, grams(15500))).toEqual({ price: pesewas(19500) });
  });

  it('reports the ceiling as the last gap when the table runs out', () => {
    const result = priceAgainstBands(rows, grams(16000));
    expect('missing' in result && result.missing).toContain('15.9kg');
  });
});

describe('TARIFF_ROWS', () => {
  it('shows every band followed by the gap row above it', () => {
    expect(TARIFF_ROWS.map((r) => r.label)).toEqual([
      'Up to 3kg', '3.1 – 3.9kg',
      'Up to 6kg', '6.1 – 6.9kg',
      'Up to 9kg', '9.1 – 9.9kg',
      'Up to 12kg', '12.1 – 12.9kg',
      'Up to 15kg', '15.1 – 15.9kg',
    ]);
    expect(TARIFF_ROWS.map((r) => r.price)).toEqual([
      7300, 7800,
      9300, 9800,
      10300, 10800,
      12800, 13300,
      19000, 19500,
    ]);
  });

  it('labels a gap from its band top', () => {
    expect(gapRowLabel(grams(3000))).toBe('3.1 – 3.9kg');
    expect(gapRowLabel(grams(12000))).toBe('12.1 – 12.9kg');
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
