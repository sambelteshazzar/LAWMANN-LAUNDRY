/**
 * Money is integer pesewas. 1 GHS = 100 pesewas. Weight is integer grams.
 *
 * The rule is enforced at the boundary by assertPesewas and assertGrams rather
 * than by branded types. A branded type buys compile-time safety and costs
 * casts, casts, and casts in every arithmetic expression. For one shop and four
 * entry points, a runtime guard plus a naming convention is the better trade.
 *
 * No float touches either value, anywhere, including in the browser. The cedi
 * has moved hard enough that a decimal rate table goes stale between reviews.
 */

export const PESEWAS_PER_GHS = 100;

export type Pesewas = number;
export type Grams = number;

export function pesewas(value: number): Pesewas {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`pesewas must be a whole number, received ${value}`);
  }
  return value;
}

export function grams(value: number): Grams {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`grams must be a whole number, received ${value}`);
  }
  return value;
}

/** Boundary guard. Called wherever an amount arrives from outside the core. */
export function assertPesewas(value: unknown, label: string): Pesewas {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be integer pesewas, received ${String(value)}`);
  }
  return value;
}

export function assertGrams(value: unknown, label: string): Grams {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be integer grams, received ${String(value)}`);
  }
  return value;
}

export function ghs(amount: number): Pesewas {
  if (!Number.isFinite(amount)) throw new RangeError(`ghs() received ${amount}`);
  return pesewas(Math.round(amount * PESEWAS_PER_GHS));
}

export function sum(values: readonly Pesewas[]): Pesewas {
  return pesewas(values.reduce((total, v) => total + v, 0));
}

/** "GH¢ 93.00". Tabular figures in CSS make columns of these line up. */
export function money(value: Pesewas): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / PESEWAS_PER_GHS);
  const frac = abs % PESEWAS_PER_GHS;
  const body = `${groupDigits(whole)}.${frac.toString().padStart(2, '0')}`;
  return `${negative ? '-' : ''}GH¢${body}`;
}

/** "GH¢ 93". For dashboards and SMS, where pesewas are noise. */
export function moneyShort(value: Pesewas): string {
  return `GH¢${groupDigits(Math.floor(value / PESEWAS_PER_GHS))}`;
}

export function plain(value: Pesewas): string {
  return (value / PESEWAS_PER_GHS).toFixed(2);
}

/**
 * Grams to a label. Rounding happens in integer tenths of a kilo on purpose:
 * dividing by 1000 and calling toFixed looks equivalent but is not, and
 * 3050g would print as "3.0kg" on a customer's receipt.
 */
export function weightLabel(value: Grams): string {
  const tenths = Math.round(value / 100);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? `${whole}kg` : `${whole}.${frac}kg`;
}

/** Grams to the two-decimal form used on a price list. */
export function weightEntry(value: Grams): string {
  return `${(value / 1000).toFixed(2)}kg`;
}

function groupDigits(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
