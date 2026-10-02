/**
 * The tariff from the shop poster photographed 26 September 2026, with two
 * figures corrected verbally by the owner the same day.
 *
 * Two defects in the source data are recorded rather than silently patched, so
 * the next person does not "fix" them back.
 *
 * 1. BAND GAPS. The poster reads 0-3, 4-6, 7-9, 10-12, 13-15. Read literally,
 *    nothing prices a 3.5kg, 6.5kg, 9.5kg or 12.5kg bag, and a scale produces
 *    those constantly. The bands are read here as cumulative "up to" thresholds
 *    at 3kg intervals, which is the only reading under which the poster is a
 *    coherent tariff. This is an assumption awaiting the owner's confirmation,
 *    and it sets the price of roughly a quarter of bags.
 *
 * 2. NO CEILING. Nothing prices a bag above 15kg. resolveBand returns null
 *    rather than extrapolating, and quoteBand explains why, because a student
 *    washing before exams will exceed it in the first week.
 *
 * The poster reads 83 for 4-6kg. The owner confirmed 93. The photograph has
 * glare across that column, and 93 is the owner's own figure, so 93 is used.
 */

import { grams, pesewas, type Grams, type Pesewas } from './money';

/** False once the owner confirms the band edges in writing. */
export const BAND_GAPS_ASSUMED = true;

export interface WeightBand {
  /** Inclusive upper bound in grams. */
  readonly to: Grams;
  readonly price: Pesewas;
  readonly label: string;
}

export const BANDS: readonly WeightBand[] = [
  { to: grams(3000), price: pesewas(7300), label: '0 to 3kg' },
  { to: grams(6000), price: pesewas(9300), label: '4 to 6kg' },
  { to: grams(9000), price: pesewas(10300), label: '7 to 9kg' },
  { to: grams(12000), price: pesewas(12800), label: '10 to 12kg' },
  { to: grams(15000), price: pesewas(19000), label: '13 to 15kg' },
];

export const MAX_BANDED = grams(15000);

export interface PiecePrice {
  readonly code: string;
  readonly name: string;
  readonly price: Pesewas;
  /** Smock, kaftan and suit are ordinarily dry cleaned in Ghana, and sneakers
   *  are a separate treatment. Flagged on the source, not decided here. */
  readonly mayBeDryClean: boolean;
}

export const PIECES: readonly PiecePrice[] = [
  { code: 'SHIRT', name: 'Shirt', price: pesewas(800), mayBeDryClean: false },
  { code: 'TROUSER', name: 'Trouser', price: pesewas(800), mayBeDryClean: false },
  { code: 'SINGLET', name: 'Singlet', price: pesewas(700), mayBeDryClean: false },
  { code: 'PILLOW_CASE', name: 'Pillow case', price: pesewas(600), mayBeDryClean: false },
  { code: 'SOCKS', name: 'Socks', price: pesewas(500), mayBeDryClean: false },
  { code: 'BOXERS', name: 'Boxers', price: pesewas(600), mayBeDryClean: false },
  { code: 'SHORTS', name: 'Shorts', price: pesewas(850), mayBeDryClean: false },
  { code: 'JEANS', name: 'Jeans', price: pesewas(1000), mayBeDryClean: false },
  { code: 'DRESS', name: 'Dress', price: pesewas(1500), mayBeDryClean: false },
  { code: 'TOWEL', name: 'Towel', price: pesewas(1500), mayBeDryClean: false },
  { code: 'BEDSHEET', name: 'Bedsheet', price: pesewas(2000), mayBeDryClean: false },
  { code: 'JACKET', name: 'Jacket', price: pesewas(2000), mayBeDryClean: false },
  { code: 'KAFTAN', name: 'Kaftan', price: pesewas(2500), mayBeDryClean: true },
  { code: 'SUIT_2PC', name: '2-piece suit', price: pesewas(3000), mayBeDryClean: true },
  { code: 'SMOCK', name: 'Smock', price: pesewas(3000), mayBeDryClean: true },
  { code: 'DUVET', name: 'Duvet', price: pesewas(7000), mayBeDryClean: false },
  { code: 'SNEAKERS', name: 'Sneakers', price: pesewas(4000), mayBeDryClean: true },
];

export type PriceMethod = 'band' | 'piece';

export interface Quote {
  readonly method: PriceMethod;
  readonly total: Pesewas;
  readonly band: WeightBand | null;
  /** Charge per kg at the top of the band, where the owner's margin is thinnest.
   *  Reporting only. Never used to settle a payment. */
  readonly perKg: Pesewas | null;
  /** Set when there is no agreed price, so the collector can ask rather than guess. */
  readonly cannotPrice: string | null;
}

export function bandFor(weight: Grams): WeightBand | null {
  if (weight <= 0) return null;
  return BANDS.find((band) => weight <= band.to) ?? null;
}

export function quoteBand(weight: Grams): Quote {
  const band = bandFor(weight);

  if (!band) {
    return {
      method: 'band',
      total: 0,
      band: null,
      perKg: null,
      cannotPrice:
        weight > MAX_BANDED
          ? `No price covers ${weight / 1000}kg. The price list stops at 15kg.`
          : 'Weight must be more than zero.',
    };
  }

  return {
    method: 'band',
    total: band.price,
    band,
    perKg: perKgAt(band.price, band.to),
    cannotPrice: null,
  };
}

export interface PieceLine {
  readonly code: string;
  readonly qty: number;
}

export function quotePieces(lines: readonly PieceLine[]): Quote {
  if (lines.length === 0) {
    return { method: 'piece', total: 0, band: null, perKg: null, cannotPrice: 'No items selected.' };
  }

  const bad = lines.find((line) => line.qty < 1);
  if (bad) {
    return {
      method: 'piece',
      total: 0,
      band: null,
      perKg: null,
      cannotPrice: `${bad.code} needs a quantity of at least one.`,
    };
  }

  const missing = lines.find((line) => !PIECES.some((p) => p.code === line.code));
  if (missing) {
    return {
      method: 'piece',
      total: 0,
      band: null,
      perKg: null,
      cannotPrice: `${missing.code} is not on the price list.`,
    };
  }

  const total = lines.reduce((acc, line) => {
    const item = PIECES.find((p) => p.code === line.code)!;
    return acc + item.price * line.qty;
  }, 0);

  return { method: 'piece', total: pesewas(total), band: null, perKg: null, cannotPrice: null };
}

export function perKgAt(price: Pesewas, weight: Grams): Pesewas {
  if (weight <= 0) return 0;
  return pesewas(Math.round((price * 1000) / weight));
}

/**
 * The band that earns the least per kilo. This is the number the owner's cost
 * has to stay under, and it is the headline in the proposal.
 */
export function thinnestBand(): { band: WeightBand; perKg: Pesewas } {
  const rated = BANDS.map((band) => ({ band, perKg: perKgAt(band.price, band.to) }));
  return rated.reduce((worst, current) => (current.perKg < worst.perKg ? current : worst));
}
