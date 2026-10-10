import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import { BANDS } from '@/lib/pricing';
import { grams, pesewas } from '@/lib/money';
import { intakeSchema } from '@/lib/validation';
import { advanceStatus, createOrder, getOrderDetail } from '@/lib/orders';
import { activityFeed } from '@/lib/activity';
import { canCorrect, correctOrder, listCorrections } from '@/lib/corrections';
import { splitTaxInclusive } from '@/lib/tax';
import type { Session } from '@/lib/auth';
import { freshDb, resetDb, seededShop, type ShopFixture, type TestDb } from './db';

/**
 * The repair flow against real Postgres: a correction re-prices through the
 * shared tariff, re-splits the tax, writes one audit row per changed field,
 * and refuses to touch a bag that has already left.
 */

let client: PGlite;
let db: TestDb;
let fx: ShopFixture;
let session: Session;

const intake = (overrides: Record<string, unknown> = {}) =>
  intakeSchema.parse({
    orderId: crypto.randomUUID(),
    locationId: fx.locationId,
    phone: '0241234567',
    name: 'Ama',
    room: 'B12',
    weightKg: '3.5',
    method: 'band',
    payment: null,
    ...overrides,
  });

const correct = (orderId: string, overrides: Record<string, unknown> = {}) =>
  correctOrder(
    db,
    orderId,
    {
      method: 'band',
      weightGrams: null,
      totalPesewa: null,
      phone: '0241234567',
      locationId: fx.locationId,
      promisedOn: null,
      note: 'scale slipped',
      ...overrides,
    },
    session,
  );

const correctionsOf = async (orderId: string) =>
  (await db.select().from(schema.orderCorrection).where(eq(schema.orderCorrection.orderId, orderId))).map((r) => [
    r.field,
    r.fromValue,
    r.toValue,
  ]);

beforeAll(async () => {
  db = await freshDb();
  client = db.$client;
});

beforeEach(async () => {
  await resetDb(db);
  fx = await seededShop(db, client);
  session = { staffId: fx.staffId, name: 'Owner', role: 'owner', shopId: fx.shopId };
  await db.insert(schema.band).values(BANDS.map((b) => ({ toGrams: b.to, price: b.price, active: true })));
});

afterAll(async () => {
  await client.close();
});

describe('canCorrect', () => {
  it('opens the door to owner and counter, closes it to collector', () => {
    expect(canCorrect('owner')).toBe(true);
    expect(canCorrect('counter')).toBe(true);
    expect(canCorrect('collector')).toBe(false);
  });
});

describe('correctOrder, band orders', () => {
  it('re-prices a gap correction through the tariff and re-splits the tax', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2900) });

    expect(result.ok).toBe(true);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.order.weightGrams).toBe(2900);
    expect(detail?.order.gross).toBe(7300);
    const split = splitTaxInclusive(7300);
    expect(detail?.order.base).toBe(split.base);
    expect(detail?.order.vat).toBe(split.vat);
    expect(detail?.order.nhil).toBe(split.nhil);
    expect(detail?.order.getfund).toBe(split.getfund);
    expect(detail !== null && detail.order.base + detail.order.vat + detail.order.nhil + detail.order.getfund).toBe(7300);
  });

  it('writes one audit row per changed field, with the note on every row', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2900) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe('Corrected · 2.9kg, GH¢73');
    expect(await correctionsOf(created.orderId)).toEqual([
      ['weight', '3.5kg', '2.9kg'],
      ['price', 'GH¢78', 'GH¢73'],
    ]);
    const rows = await db.select().from(schema.orderCorrection);
    expect(rows.every((r) => r.note === 'scale slipped' && r.staffId === fx.staffId)).toBe(true);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
  });

  it('refuses a correction that changes nothing', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(3500) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Nothing is different');
  });

  it('refuses a collected order and a cancelled one, in words', async () => {
    const collected = await createOrder(db, intake(), session);
    const cancelled = await createOrder(db, intake(), session);
    if (!collected.ok || !cancelled.ok) throw new Error('setup failed');
    await advanceStatus(db, collected.orderId, 'washing', session);
    await advanceStatus(db, collected.orderId, 'ready', session);
    await advanceStatus(db, collected.orderId, 'collected', session);
    await advanceStatus(db, cancelled.orderId, 'cancelled', session);

    const a = await correct(collected.orderId, { weightGrams: grams(2900) });
    const b = await correct(cancelled.orderId, { weightGrams: grams(2900) });

    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (a.ok || b.ok) return;
    expect(a.error).toContain('collected');
    expect(b.error).toContain('cancelled');
    expect(await db.select().from(schema.orderCorrection)).toHaveLength(0);
  });
});

describe('correctOrder, piece orders', () => {
  it('corrects the total, never the weight', async () => {
    const created = await createOrder(db, intake({ method: 'piece', pieces: [{ code: 'SHIRT', qty: 2 }] }), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { method: 'piece', totalPesewa: pesewas(1800) });

    expect(result.ok).toBe(true);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.order.gross).toBe(1800);
    expect(detail?.order.weightGrams).toBe(3500);
    expect(await correctionsOf(created.orderId)).toEqual([['price', 'GH¢16', 'GH¢18']]);
  });
});

describe('activity feed', () => {
  it('shows one correction line per action, naming every field it moved', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    const result = await correct(created.orderId, { weightGrams: grams(2900) });
    expect(result.ok).toBe(true);

    const feed = await activityFeed(db, fx.shopId, { kind: 'correction' });

    expect(feed).toHaveLength(1);
    expect(feed[0]?.who).toBe('Owner');
    expect(feed[0]?.text).toContain('weight 3.5kg to 2.9kg');
    expect(feed[0]?.text).toContain('price GH¢78 to GH¢73');
  });
});

describe('correctOrder, the student and the money', () => {
  it('moves the order to the right student and deletes the vacated row', async () => {
    const created = await createOrder(db, intake({ phone: '0249999999', name: 'Ama' }), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2000), phone: '0241234567', note: 'wrong student, phone typo' });

    expect(result.ok).toBe(true);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.student.phone).toBe('0241234567');
    const students = await db.select({ phone: schema.student.phone }).from(schema.student);
    expect(students.map((s) => s.phone)).toEqual(['0241234567']);
    expect(await correctionsOf(created.orderId)).toEqual([
      ['weight', '3.5kg', '2kg'],
      ['price', 'GH¢78', 'GH¢73'],
      ['student', '0249999999', '0241234567'],
    ]);
  });

  it('keeps a student row that still has another order', async () => {
    const first = await createOrder(db, intake({ phone: '0249999999' }), session);
    const second = await createOrder(db, intake({ orderId: crypto.randomUUID(), phone: '0249999999' }), session);
    if (!first.ok || !second.ok) throw new Error('setup failed');

    const result = await correct(first.orderId, { weightGrams: grams(2000), phone: '0241234567', note: 'wrong student, phone typo' });

    expect(result.ok).toBe(true);
    const students = await db.select({ phone: schema.student.phone }).from(schema.student);
    expect(students.map((s) => s.phone).sort()).toEqual(['0241234567', '0249999999']);
  });

  it('a downward correction below what was paid leaves a negative balance and names the refund', async () => {
    const created = await createOrder(db, intake({ payment: { method: 'cash', amount: '78' } }), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2900) });

    expect(result.ok).toBe(true);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.balancePesewa).toBe(-500);
    const corrected = (await db.select().from(schema.smsMessage)).filter((m) => m.kind === 'corrected');
    expect(corrected).toHaveLength(1);
    expect(corrected[0]?.body).toContain('Refund due GH¢5');
  });

  it('a money correction texts the student once', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2900) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.smsQueued).toBe(true);
    const corrected = (await db.select().from(schema.smsMessage)).filter((m) => m.kind === 'corrected');
    expect(corrected).toHaveLength(1);
    expect(corrected[0]?.body).toBe('LAWMANN: order ' + created.orderNo + ' corrected to 2.9kg, GH¢73. Balance owing GH¢73.');
  });

  it('a date-only correction texts nobody', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { promisedOn: '2026-10-16', note: 'student asked for later' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.smsQueued).toBe(false);
    expect((await db.select().from(schema.smsMessage)).filter((m) => m.kind === 'corrected')).toHaveLength(0);
    expect(await correctionsOf(created.orderId)).toEqual([['promised_date', 'none', '2026-10-16']]);
  });

  it('listCorrections reads the trail back with who and when', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    await correct(created.orderId, { weightGrams: grams(2900) });

    const rows = await listCorrections(db, created.orderId);

    expect(rows.map((r) => r.field)).toEqual(['weight', 'price']);
    expect(rows[0]?.staffName).toBe('Owner');
    expect(rows[0]?.note).toBe('scale slipped');
    expect(rows[0]?.at).toBeInstanceOf(Date);
  });

  it('refuses a method mismatch in the order’s own words', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const withPrice = await correct(created.orderId, { totalPesewa: pesewas(5000) });
    expect(withPrice.ok).toBe(false);
    if (withPrice.ok) return;
    expect(withPrice.error).toContain('prices by weight');
  });
});
