/**
 * The tariff from the shop poster photographed 26 September 2026, with one
 * figure corrected verbally by the owner the same day.
 *
 * The poster reads 83 for 4-6kg. The owner confirmed 93. The photograph has
 * glare across that column, and 93 is the owner's own figure, so 93 is used.
 *
 * The bands read 0-3, 4-6, 7-9, 10-12, 13-15, and nothing prices a bag above
 * 15kg. Read literally, nothing prices a 3.5kg, 6.5kg, 9.5kg or 12.5kg bag
 * either, and a scale produces those constantly. The owner settled the gaps
 * on 9 October 2026: a reading that lands between two bands — 3.1 to 3.9,
 * 6.1 to 6.9, and so on — prices at the band below it plus a GH¢5 surcharge.
 * A decimal inside a band range, like 4.5kg, stays at the band price. A
 * reading of 16.0kg and above still has no price and is spot-priced at the
 * counter.
 *
 * Every surface that prices a bag — staff intake, its live quote, the seed,
 * the reports buckets — goes through this file, so the rule is stated once.
 */

import { grams, pesewas, type Grams, type Pesewas } from './money';

/** The owner's surcharge for a reading between two bands. */
export const GAP_SURCHARGE = pesewas(500);

export interface WeightBand {
  /** Inclusive upper bound in grams, as the poster prints it. */
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

/** The heaviest reading that carries a price: the gap above the top band. */
export const MAX_PRICED = grams(15900);

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
  /** Charge per kg at the top of what was bought: the band's top, or the
   *  gap's top, where the owner's margin is thinnest. Reporting only. Never
   *  used to settle a payment. */
  readonly perKg: Pesewas | null;
  /** Set when there is no agreed price, so the collector can ask rather than guess. */
  readonly cannotPrice: string | null;
}

/** "3.1 – 3.9kg": the gap above a band top, labelled by any surface that shows rows. */
export function gapRowLabel(bandTopGrams: Grams): string {
  return `${bandTopGrams / 1000 + 0.1} – ${bandTopGrams / 1000 + 0.9}kg`;
}

/** The whole-kilo part of a reading, in grams: 3500g reads as a 3kg bag. */
function wholeKilos(weight: Grams): Grams {
  return Math.floor(weight / 1000) * 1000;
}

/**
 * The band a reading prices against: the one whose top covers the reading's
 * whole part. A 3.5kg bag is a 3kg bag, not a 6kg one. The half kilo over
 * the top is the gap surcharge, never the next band up.
 */
export function bandFor(weight: Grams): WeightBand | null {
  if (weight <= 0) return null;
  const whole = wholeKilos(weight);
  return BANDS.find((band) => whole <= band.to) ?? null;
}

export function quoteBand(weight: Grams): Quote {
  if (weight <= 0) {
    return { method: 'band', total: 0, band: null, perKg: null, cannotPrice: 'Weight must be more than zero.' };
  }

  const band = bandFor(weight);
  if (!band) {
    return {
      method: 'band',
      total: 0,
      band: null,
      perKg: null,
      cannotPrice: `No price covers ${weight / 1000}kg. The price list stops at ${MAX_PRICED / 1000}kg.`,
    };
  }

  // A reading past the band's top is the gap the poster never priced: the
  // band price plus the owner's surcharge.
  const gap = weight > band.to;
  const total = gap ? pesewas(band.price + GAP_SURCHARGE) : band.price;

  return {
    method: 'band',
    total,
    band,
    perKg: perKgAt(total, gap ? band.to + 900 : band.to),
    cannotPrice: null,
  };
}

export interface BandRow {
  readonly toGrams: number;
  readonly pricePesewa: number;
}

/**
 * Prices a reading against a cumulative band table — the shape the database
 * stores, so the owner can change prices without a code change. Staff intake
 * and its live quote both price through here, which is why the gap rule
 * lives in this file and not in two callers.
 */
export function priceAgainstBands(
  bands: readonly BandRow[],
  weightGrams: Grams,
): { price: Pesewas } | { missing: string } {
  if (weightGrams <= 0) return { missing: 'Weight must be more than zero.' };
  const sorted = [...bands].sort((a, b) => a.toGrams - b.toGrams);
  const whole = wholeKilos(weightGrams);
  const band = sorted.find((b) => whole <= b.toGrams);
  if (!band) {
    const ceiling = sorted.length > 0 ? Math.max(...sorted.map((b) => b.toGrams)) + 900 : MAX_PRICED;
    return { missing: `No price covers ${weightGrams / 1000}kg. The price list stops at ${ceiling / 1000}kg.` };
  }
  const gap = weightGrams > band.toGrams;
  return { price: gap ? pesewas(band.pricePesewa + GAP_SURCHARGE) : (band.pricePesewa as Pesewas) };
}

export interface TariffRow {
  readonly label: string;
  readonly price: Pesewas;
}

/**
 * The price list as a student reads it: every band, then the gap row above
 * it. Two rows per band, because the gap row is where the owner's surcharge
 * lives and a customer deserves to see it before the scale does.
 */
export const TARIFF_ROWS: readonly TariffRow[] = BANDS.flatMap((band) => [
  { label: `Up to ${band.to / 1000}kg`, price: band.price },
  { label: gapRowLabel(band.to), price: pesewas(band.price + GAP_SURCHARGE) },
]);

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
 * The tariff row that earns the least per kilo. This is the number the
 * owner's cost has to stay under, and it is the headline in the proposal.
 * Gap rows count: a 12.9kg bag at GH¢133 earns GH¢10.31 per kilo, which is
 * thinner than any whole band.
 */
export function thinnestBand(): { label: string; perKg: Pesewas } {
  const rows: Array<{ label: string; perKg: Pesewas }> = [];
  for (const band of BANDS) {
    rows.push({ label: band.label, perKg: perKgAt(band.price, band.to) });
    rows.push({ label: gapRowLabel(band.to), perKg: perKgAt(band.price + GAP_SURCHARGE, band.to + 900) });
  }
  return rows.reduce((worst, row) => (row.perKg < worst.perKg ? row : worst));
}
