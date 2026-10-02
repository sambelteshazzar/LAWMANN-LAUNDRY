import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import { BANDS } from '@/lib/pricing';
import type { Session } from '@/lib/auth';
import { intakeSchema, paymentSchema } from '@/lib/validation';
import {
  advanceStatus,
  cancelOrder,
  confirmMomoPayment,
  createOrder,
  findStudentByPhone,
  getOrderDetail,
  listOrders,
  takePayment,
} from '@/lib/orders';
import { freshDb, resetDb, seededShop, type ShopFixture, type TestDb } from './db';

/**
 * The money flow, end to end, against real Postgres: intake recomputes the
 * gross, the tax split is stored once, payments obey the balance, status
 * moves leave an audit trail, and every customer-facing action enqueues the
 * exact SMS the student should receive.
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

describe('createOrder', () => {
  it('prices a 3.5kg bag at GH¢93, stores a footing split, numbers the order', async () => {
    const result = await createOrder(db, intake(), session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orderNo).toMatch(/^LW-\d{6}-001$/);

    const detail = await getOrderDetail(db, result.orderId, session);
    expect(detail?.order.gross).toBe(9300);
    expect(detail?.order.base! + detail?.order.vat! + detail?.order.nhil! + detail?.order.getfund!).toBe(9300);
    expect(detail?.balancePesewa).toBe(9300);
    expect(detail?.order.recordedBy).toBe(fx.staffId);
  });

  it('sequences order numbers through the day', async () => {
    const first = await createOrder(db, intake(), session);
    const second = await createOrder(db, intake(), session);
    if (!first.ok || !second.ok) throw new Error('setup failed');
    expect(second.orderNo).toBe(first.orderNo.slice(0, -3) + '002');
  });

  it('prices piece orders from the list, weight still recorded', async () => {
    const result = await createOrder(
      db,
      intake({ method: 'piece', pieces: [{ code: 'SHIRT', qty: 2 }] }),
      session,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const detail = await getOrderDetail(db, result.orderId, session);
    expect(detail?.order.gross).toBe(1600);
    expect(detail?.order.method).toBe('piece');
    expect(detail?.order.weightGrams).toBe(3500);
  });

  it('refuses a bag above the price list in words, and records nothing', async () => {
    const result = await createOrder(db, intake({ weightKg: '16' }), session);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('15kg');
    expect(await listOrders(db, session, 'all')).toHaveLength(0);
  });

  it('an over-balance cash payment at intake fails the payment but keeps the order', async () => {
    const result = await createOrder(db, intake({ payment: { method: 'cash', amount: '100' } }), session);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('exceeds the remaining balance');
    expect(result.orderId).toBeDefined();
    expect(result.orderNo).toMatch(/^LW-\d{6}-001$/);
  });

  it('a retried intake with the same id returns the same order, never a duplicate', async () => {
    const orderId = crypto.randomUUID();
    const first = await createOrder(db, intake({ orderId }), session);
    const second = await createOrder(db, intake({ orderId }), session);
    expect(first).toEqual(second);
    expect(await listOrders(db, session, 'all')).toHaveLength(1);
  });

  it('records the agreed pickup date when given', async () => {
    const result = await createOrder(db, intake({ promisedOn: '2026-10-02' }), session);
    if (!result.ok) throw new Error('setup failed');
    const detail = await getOrderDetail(db, result.orderId, session);
    expect(detail?.order.promisedAt?.toISOString()).toContain('2026-10-02');
  });

  it('enqueues the accepted SMS with weight, price and balance', async () => {
    const result = await createOrder(db, intake({ payment: { method: 'cash', amount: '50' } }), session);
    if (!result.ok) throw new Error(`setup failed: ${JSON.stringify(result)}`);
    const messages = await db.select().from(schema.smsMessage);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.kind).toBe('accepted');
    expect(messages[0]?.toPhone).toBe('0241234567');
    expect(messages[0]?.body).toBe(
      `Lawmann: bag received for Ama. 3.5kg, GH¢93. Balance owing GH¢43. Order ${result.orderNo}.`,
    );
  });

  it('reuses an existing student by phone and fills in a missing name', async () => {
    await createOrder(db, intake({ phone: '0249999999' }), session);
    const found = await findStudentByPhone(db, fx.shopId, '+233249999999');
    expect(found?.student.name).toBe('Ama');
    expect(found?.openBalancePesewa).toBe(9300);
    expect(found?.oldestOpen?.balancePesewa).toBe(9300);
  });
});

describe('takePayment and confirmMomoPayment', () => {
  it('cash then MoMo partials leave the documented balance', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    const cash = await takePayment(
      db,
      created.orderId,
      paymentSchema.parse({ orderId: created.orderId, method: 'cash', amount: '30' }),
      session,
    );
    expect(cash.ok).toBe(true);
    const momo = await takePayment(
      db,
      created.orderId,
      paymentSchema.parse({ orderId: created.orderId, method: 'momo', amount: '20', gatewayRef: 'MP1.A' }),
      session,
    );
    expect(momo.ok).toBe(true);

    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.paidPesewa).toBe(5000);
    expect(detail?.balancePesewa).toBe(4300);
    expect(detail?.payments.map((p) => p.state)).toEqual(['confirmed', 'pending_momo']);
  });

  it('MoMo without a transaction ref is refused before touching the database', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    const result = await takePayment(
      db,
      created.orderId,
      { orderId: created.orderId, method: 'momo', amount: 2000 } as never,
      session,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('MoMo transaction ref');
  });

  it('a replayed gateway ref is success, and cash sends the payment SMS', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    const input = paymentSchema.parse({ orderId: created.orderId, method: 'momo', amount: '10', gatewayRef: 'MP2.B' });
    expect(await takePayment(db, created.orderId, input, session)).toEqual({ ok: true, orderId: created.orderId, orderNo: created.orderNo });
    expect(await takePayment(db, created.orderId, input, session)).toEqual({ ok: true, orderId: created.orderId, orderNo: created.orderNo });

    const cash = await takePayment(
      db,
      created.orderId,
      paymentSchema.parse({ orderId: created.orderId, method: 'cash', amount: '10' }),
      session,
    );
    expect(cash.ok).toBe(true);
    const messages = await db.select().from(schema.smsMessage).orderBy(schema.smsMessage.createdAt);
    expect(messages.map((m) => m.kind)).toEqual(['accepted', 'payment']);
    expect(messages[1]?.body).toContain('Balance owing GH¢73.');
  });

  it('confirming a pending MoMo confirms it and texts the student; twice is a friendly error', async () => {
    const created = await createOrder(
      db,
      intake({ payment: { method: 'momo', amount: '40', gatewayRef: 'MP3.C' } }),
      session,
    );
    if (!created.ok) throw new Error('setup failed');
    const payments = await db.select().from(schema.payment).where(eq(schema.payment.orderId, created.orderId));
    const confirmed = await confirmMomoPayment(db, payments[0]!.id, session);
    expect(confirmed.ok).toBe(true);

    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.payments[0]?.state).toBe('confirmed');
    const messages = await db.select().from(schema.smsMessage).orderBy(schema.smsMessage.createdAt);
    expect(messages.map((m) => m.kind)).toEqual(['accepted', 'payment']);

    const again = await confirmMomoPayment(db, payments[0]!.id, session);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error).toContain('already confirmed');
  });
});

describe('advanceStatus and cancelOrder', () => {
  it('walks the lifecycle, stamps readyAt, and records who moved it', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    expect((await advanceStatus(db, created.orderId, 'washing', session)).ok).toBe(true);
    expect((await advanceStatus(db, created.orderId, 'ready', session)).ok).toBe(true);

    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.order.readyAt).not.toBeNull();
    expect(detail?.events.map((e) => `${e.from}->${e.to} by ${e.staffName}`)).toEqual([
      'received->washing by Owner',
      'washing->ready by Owner',
    ]);

    const messages = await db.select().from(schema.smsMessage).orderBy(schema.smsMessage.createdAt);
    expect(messages.map((m) => m.kind)).toEqual(['accepted', 'ready']);
    expect(messages[1]?.body).toBe(`Lawmann: your laundry is ready for collection. Order ${created.orderNo}.`);
  });

  it('a backwards move fails with the trigger’s own words', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    await advanceStatus(db, created.orderId, 'washing', session);
    const result = await advanceStatus(db, created.orderId, 'received', session);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('cannot move backwards');
  });

  it('repeating the current status is a quiet success with no event', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    expect(await advanceStatus(db, created.orderId, 'received', session)).toEqual({
      ok: true,
      orderId: created.orderId,
      orderNo: created.orderNo,
    });
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.events).toHaveLength(0);
  });

  it('cancelling an open order works; cancelling a collected one does not', async () => {
    const open = await createOrder(db, intake(), session);
    if (!open.ok) throw new Error('setup failed');
    expect((await cancelOrder(db, open.orderId, session)).ok).toBe(true);

    const done = await createOrder(db, intake(), session);
    if (!done.ok) throw new Error('setup failed');
    await advanceStatus(db, done.orderId, 'washing', session);
    await advanceStatus(db, done.orderId, 'ready', session);
    await advanceStatus(db, done.orderId, 'collected', session);
    const refused = await cancelOrder(db, done.orderId, session);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toContain('collected');
  });
});

describe('listOrders', () => {
  it('open hides collected and cancelled orders', async () => {
    const a = await createOrder(db, intake(), session);
    const b = await createOrder(db, intake(), session);
    const c = await createOrder(db, intake(), session);
    if (!a.ok || !b.ok || !c.ok) throw new Error('setup failed');
    await advanceStatus(db, b.orderId, 'washing', session);
    await advanceStatus(db, b.orderId, 'ready', session);
    await advanceStatus(db, b.orderId, 'collected', session);
    await cancelOrder(db, c.orderId, session);

    const open = await listOrders(db, session, 'open');
    expect(open.map((o) => o.orderNo)).toEqual([a.orderNo]);
    expect(open[0]?.balancePesewa).toBe(9300);
    expect(await listOrders(db, session, 'all')).toHaveLength(3);
    expect(await listOrders(db, session, 'cancelled')).toHaveLength(1);
  });
});
