/**
 * Ghana consumption tax under the Value Added Tax Act 2025 (Act 1151), in force
 * 1 January 2026.
 *
 *   VAT 15% + NHIL 2.5% + GETFund 2.5% = 20% of the tax-exclusive value
 *
 * Act 1151 abolished the VAT Flat Rate Scheme, so every taxable supply splits
 * the same way, and there is no turnover threshold for services (only for
 * goods), so a laundry registers regardless of size.
 *
 * Shop-board prices are tax-inclusive, so the working direction is inclusive
 * back to exclusive, which does not divide evenly in pesewas. GH¢73 is 7300
 * pesewas and splits four ways with a fractional pesewa left over. That residue
 * is real money. A return whose components do not sum to the invoice total is a
 * return that does not reconcile.
 *
 * Largest-remainder allocation: floor every component, then give the leftover
 * pesewas to the components with the largest fractional parts. The four parts
 * then always sum to exactly the total, and the error is at most one pesewa
 * rather than accumulating across a month.
 *
 * This is the highest-risk arithmetic in the app. It is pure, dependency-free,
 * and property-tested in test/tax.test.ts. Nothing else may reimplement it.
 */

import { pesewas, type Pesewas } from './money';

/** Shares of the tax-inclusive amount, in ten-thousandths. Sums to 12000. */
export const VAT_RATE = 1500;
export const NHIL_RATE = 250;
export const GETFUND_RATE = 250;
export const EXCLUSIVE_BASE_RATE = 10000;

const DENOMINATOR = 12000;

export interface TaxSplit {
  /** Tax-exclusive value the levies were computed on. */
  readonly base: Pesewas;
  readonly vat: Pesewas;
  readonly nhil: Pesewas;
  readonly getfund: Pesewas;
  readonly total: Pesewas;
}

type LevyKey = 'base' | 'vat' | 'nhil' | 'getfund';

const PARTS: ReadonlyArray<{ key: LevyKey; rate: number }> = [
  { key: 'base', rate: EXCLUSIVE_BASE_RATE },
  { key: 'vat', rate: VAT_RATE },
  { key: 'nhil', rate: NHIL_RATE },
  { key: 'getfund', rate: GETFUND_RATE },
];

export function splitTaxInclusive(inclusive: Pesewas): TaxSplit {
  if (inclusive === 0) {
    return { base: 0, vat: 0, nhil: 0, getfund: 0, total: 0 };
  }

  const sign = inclusive < 0 ? -1 : 1;
  const magnitude = Math.abs(inclusive);

  const parts = PARTS.map(({ key, rate }) => {
    const numerator = magnitude * rate;
    return { key, whole: Math.floor(numerator / DENOMINATOR), rest: numerator % DENOMINATOR };
  });

  // Deterministic ordering: largest remainder first, ties broken by position in
  // PARTS, so re-running a month never reshuffles which component absorbs the residue.
  const byRest = [...parts].sort((a, b) => {
    if (b.rest !== a.rest) return b.rest - a.rest;
    return PARTS.findIndex((p) => p.key === a.key) - PARTS.findIndex((p) => p.key === b.key);
  });

  const bumped = new Set<LevyKey>();
  let leftover = magnitude - parts.reduce((total, p) => total + p.whole, 0);
  for (const part of byRest) {
    if (leftover <= 0) break;
    bumped.add(part.key);
    leftover -= 1;
  }

  const value = (key: LevyKey): Pesewas =>
    pesewas(sign * (parts.find((p) => p.key === key)!.whole + (bumped.has(key) ? 1 : 0)));

  return {
    base: value('base'),
    vat: value('vat'),
    nhil: value('nhil'),
    getfund: value('getfund'),
    total: inclusive,
  };
}

/** What to charge to land on a target tax-exclusive amount. */
export function grossUpForNet(net: Pesewas): Pesewas {
  return pesewas(Math.round((net * DENOMINATOR) / EXCLUSIVE_BASE_RATE));
}

/**
 * The levy expressed as a fraction of a tax-inclusive amount: 20% of an
 * exclusive base is 1/6 of the inclusive total. Kept as a function so nobody
 * inlines 0.1666.
 */
export function inclusiveTaxFraction(): number {
  return (VAT_RATE + NHIL_RATE + GETFUND_RATE) / DENOMINATOR;
}
