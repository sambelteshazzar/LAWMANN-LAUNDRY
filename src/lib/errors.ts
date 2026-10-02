/**
 * Translates the database's own laws into sentences a person at a counter can
 * act on. The laws live in triggers and constraints; this file never decides
 * anything, it only converts Postgres error codes into named cases so the
 * service layer can show the trigger's words instead of a stack trace.
 *
 * The important one is 'replay': a retried sync colliding on an idempotency
 * key is the designed outcome, not an error.
 */

export type DbLawErrorCode =
  | 'payment_over_balance'
  | 'bad_status_move'
  | 'tax_not_footing'
  | 'bad_weight'
  | 'replay'
  | 'order_no_race';

export class DbLawError extends Error {
  constructor(message: string, public readonly code: DbLawErrorCode) {
    super(message);
    this.name = 'DbLawError';
  }
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
  message?: string;
}

function asPgError(err: unknown): PgErrorLike | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as PgErrorLike & { cause?: unknown };
  const code = typeof e.code === 'string' ? e.code : undefined;
  const constraint = typeof e.constraint === 'string' ? e.constraint : undefined;
  const message = typeof e.message === 'string' ? e.message : undefined;
  if (code || constraint) return { code, constraint, message };
  if (e.cause) return asPgError(e.cause);
  return null;
}

export function translateDbError(err: unknown): DbLawError | null {
  const pg = asPgError(err);
  if (!pg) return null;

  const message = pg.message ?? '';

  if (pg.constraint === 'orders_tax_foots') {
    return new DbLawError('The tax components do not add up to the order total.', 'tax_not_footing');
  }
  if (pg.constraint === 'orders_weight_positive') {
    return new DbLawError('Weight must be more than zero.', 'bad_weight');
  }
  if (pg.code === '23505') {
    if (pg.constraint === 'payment_gateway_ref') return new DbLawError('This MoMo transaction was already recorded.', 'replay');
    if (pg.constraint === 'orders_pkey') return new DbLawError('This order was already recorded.', 'replay');
    if (pg.constraint === 'orders_shop_no') return new DbLawError('Order number collision.', 'order_no_race');
  }
  if (pg.code === '23514' && message.includes('exceeds the remaining balance')) {
    return new DbLawError(message, 'payment_over_balance');
  }
  if (pg.code === '23514' && message.includes('payment must be positive')) {
    return new DbLawError('A payment must be a positive amount.', 'payment_over_balance');
  }
  if (pg.code === '23001') {
    return new DbLawError(message, 'bad_status_move');
  }
  if (pg.code === '23514') {
    return new DbLawError(message, 'bad_status_move');
  }
  return null;
}
