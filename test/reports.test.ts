import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import { BANDS } from '@/lib/pricing';
import { splitTaxInclusive } from '@/lib/tax';
import type { Session } from '@/lib/auth';
import { addCost, listCosts } from '@/lib/costs';
import { closeShift, currentShift, lastClosedShift, openShift } from '@/lib/shifts';
import {
  arrearsList,
  bandMix,
  costPerKilo,
  intakeCounts,
  moneyToday,
  revenueInRange,
  statusCounts,
  taxSummary,
} from '@/lib/reports';
import { activityFeed } from '@/lib/activity';
import { costSchema } from '@/lib/validation';
import { freshDb, legalOrder, resetDb, seededShop, type ShopFixture, type TestDb } from './db';

/**
 * The owner's questions, answered from a date-controlled shop: three orders
 * across three periods, mixed payments, weekly costs, an open shift, one
 * status event and one queued SMS. Every number below is hand-computed from
 * the fixture, so a wrong figure means a wrong query, not a wrong test.
 */

const NOW = new Date('2026-09-28T12:00:00Z'); // a Monday
const MONTH = { from: new Date('2026-09-01T00:00:00Z'), to: NOW };

let client: PGlite;
let db: TestDb;
let fx: ShopFixture;
let session: Session;

async function pay(orderId: string, amount: number, method: 'cash' | 'momo', state: 'confirmed' | 'pending_momo', paidAt: Date, gatewayRef?: string) {
  await db.insert(schema.payment).values({ orderId, amount, method, state, paidAt, recordedBy: fx.staffId, gatewayRef: gatewayRef ?? null });
}

beforeAll(async () => {
  db = await freshDb();
  client = db.$client;
});

beforeEach(async () => {
  await resetDb(db);
  fx = await seededShop(db, client);
  session = { staffId: fx.staffId, name: 'Owner', role: 'owner', shopId: fx.shopId };
  await db.insert(schema.band).values(BANDS.map((b) => ({ toGrams: b.to, price: b.price, active: true })));

  // A: today, fully paid cash. B: yesterday (previous week), half paid with a pending MoMo. C: August, unpaid.
  const a = await legalOrder(fx, { grossPesewa: 9300, weightGrams: 3500, createdAt: new Date('2026-09-28T09:00:00Z') });
  const b = await legalOrder(fx, { grossPesewa: 9300, weightGrams: 3500, createdAt: new Date('2026-09-27T09:00:00Z') });
  const c = await legalOrder(fx, { grossPesewa: 10300, weightGrams: 6500, createdAt: new Date('2026-08-15T09:00:00Z') });
  const d = await legalOrder(fx, { grossPesewa: 7300, weightGrams: 2000, createdAt: new Date('2026-09-20T09:00:00Z') });
  await pay(a.id, 9300, 'cash', 'confirmed', new Date('2026-09-28T10:00:00Z'));
  await pay(b.id, 3000, 'cash', 'confirmed', new Date('2026-09-27T10:00:00Z'));
  await pay(b.id, 2000, 'momo', 'pending_momo', new Date('2026-09-27T11:00:00Z'), 'MP9.Z');
  await pay(d.id, 7300, 'cash', 'confirmed', new Date('2026-09-20T10:00:00Z'));
  await db.update(schema.orders).set({ status: 'collected', collectedAt: new Date('2026-09-21T10:00:00Z') }).where(eqOrder(d.id));

  await db.insert(schema.operatingCost).values([
    { shopId: fx.shopId, category: 'gas', label: 'Total refill', amount: 8000, incurredOn: '2026-09-28' },
    { shopId: fx.shopId, category: 'wages', label: 'Kofi week', amount: 20000, incurredOn: '2026-09-25' },
    { shopId: fx.shopId, category: 'detergent', label: 'Omo box', amount: 5000, incurredOn: '2026-08-10' },
  ]);

  await db.insert(schema.shift).values({ staffId: fx.staffId, openedAt: new Date('2026-09-28T08:00:00Z'), float: 10000 });

  await db.insert(schema.orderEvent).values({ orderId: a.id, fromStatus: 'received', toStatus: 'washing', staffId: fx.staffId, at: new Date('2026-09-28T09:30:00Z') });

  await db.insert(schema.smsMessage).values({
    shopId: fx.shopId, orderId: a.id, kind: 'accepted', toPhone: '0241234567',
    body: 'Lawmann: test.', state: 'queued', createdAt: new Date('2026-09-28T09:01:00Z'),
  });

  return { a, b, c, d };
});

afterAll(async () => {
  await client.close();
});

function eqOrder(id: string) {
  return eq(schema.orders.id, id);
}

describe('moneyToday', () => {
  it('counts confirmed money, and shows pending MoMo separately', async () => {
    const summary = await moneyToday(db, fx.shopId, NOW);
    expect(summary.confirmedPesewa).toBe(9300);
    expect(summary.confirmedCount).toBe(1);
    expect(summary.pendingPesewa).toBe(0);
    expect(summary.pendingCount).toBe(0);
  });

  it('sees pending MoMo on the day it was claimed', async () => {
    const summary = await moneyToday(db, fx.shopId, new Date('2026-09-27T12:00:00Z'));
    expect(summary.confirmedPesewa).toBe(3000);
    expect(summary.pendingPesewa).toBe(2000);
    expect(summary.pendingCount).toBe(1);
  });
});

describe('intakeCounts', () => {
  it('counts day, Monday-start week, and calendar month', async () => {
    const counts = await intakeCounts(db, fx.shopId, NOW);
    expect(counts.day).toBe(1);
    expect(counts.week).toBe(1);
    expect(counts.month).toBe(3);
  });
});

describe('revenueInRange', () => {
  it('sums confirmed payments inside the range', async () => {
    const revenue = await revenueInRange(db, fx.shopId, MONTH);
    expect(revenue).toEqual({ confirmedPesewa: 19600, confirmedCount: 3 });
  });
});

describe('statusCounts', () => {
  it('groups every order by status', async () => {
    expect(await statusCounts(db, fx.shopId)).toEqual({ received: 3, collected: 1 });
  });
});

describe('arrearsList', () => {
  it('lists every open balance oldest first, with someone to call', async () => {
    const rows = await arrearsList(db, fx.shopId);
    expect(rows.map((r) => [r.balancePesewa, r.studentPhone])).toEqual([
      [10300, '0241234567'],
      [4300, '0241234567'],
    ]);
    expect(rows[0]?.createdAt.toISOString()).toContain('2026-08-15');
    expect(rows.every((r) => ['received', 'washing', 'ready'].includes(r.status))).toBe(true);
  });
});

describe('taxSummary', () => {
  it('sums the stored splits, never recomputes them', async () => {
    const summary = await taxSummary(db, fx.shopId, MONTH);
    const expected = [9300, 9300, 7300].map(splitTaxInclusive).reduce(
      (acc, s) => ({ base: acc.base + s.base, vat: acc.vat + s.vat, nhil: acc.nhil + s.nhil, getfund: acc.getfund + s.getfund }),
      { base: 0, vat: 0, nhil: 0, getfund: 0 },
    );
    expect(summary).toEqual({ basePesewa: expected.base, vatPesewa: expected.vat, nhilPesewa: expected.nhil, getfundPesewa: expected.getfund });
    expect(summary.basePesewa + summary.vatPesewa + summary.nhilPesewa + summary.getfundPesewa).toBe(9300 + 9300 + 7300);
  });
});

describe('costPerKilo', () => {
  it('divides the month’s bills by the month’s kilos', async () => {
    const result = await costPerKilo(db, fx.shopId, MONTH);
    expect(result.kilosGrams).toBe(9000);
    expect(result.costPesewa).toBe(28000);
    expect(result.perKiloPesewa).toBe(3111);
  });

  it('returns null per-kilo when nothing was washed, not a division error', async () => {
    const result = await costPerKilo(db, fx.shopId, { from: new Date('2025-01-01T00:00:00Z'), to: new Date('2025-01-31T00:00:00Z') });
    expect(result.perKiloPesewa).toBeNull();
  });
});

describe('bandMix', () => {
  it('buckets orders the way they were priced, with earned per-kilo', async () => {
    const mix = await bandMix(db, fx.shopId, MONTH);
    expect(mix).toEqual([
      { band: '3.1 – 3.9kg', orders: 2, kilosGrams: 7000, revenuePesewa: 18600, perKiloPesewa: 2657 },
      { band: 'Up to 3kg', orders: 1, kilosGrams: 2000, revenuePesewa: 7300, perKiloPesewa: 3650 },
    ]);
  });
});

describe('shifts', () => {
  it('one shift open at a time, and closing reconciles the drawer', async () => {
    const current = await currentShift(db, fx.shopId);
    expect(current?.staffName).toBe('Owner');
    expect(current?.float).toBe(10000);

    const second = await openShift(db, { float: 5000 }, session);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toContain('already open');

    const closed = await closeShift(db, current!.id, { counted: 19300 }, session);
    expect(closed).toEqual({ ok: true, close: { countedPesewa: 19300, expectedPesewa: 19300, variancePesewa: 0 } });
    expect(await currentShift(db, fx.shopId)).toBeNull();
  });

  it('a short drawer shows as a negative variance', async () => {
    const current = await currentShift(db, fx.shopId);
    const closed = await closeShift(db, current!.id, { counted: 19000 }, session);
    expect(closed).toEqual({ ok: true, close: { countedPesewa: 19000, expectedPesewa: 19300, variancePesewa: -300 } });
  });

  it('closing twice is refused', async () => {
    const current = await currentShift(db, fx.shopId);
    await closeShift(db, current!.id, { counted: 19300 }, session);
    const again = await closeShift(db, current!.id, { counted: 19300 }, session);
    expect(again.ok).toBe(false);
  });

  it('the last closed shift keeps its recomputed variance for display', async () => {
    expect(await lastClosedShift(db, fx.shopId)).toBeNull();
    const current = await currentShift(db, fx.shopId);
    await closeShift(db, current!.id, { counted: 19000 }, session);
    const last = await lastClosedShift(db, fx.shopId);
    expect(last).toMatchObject({ staffName: 'Owner', countedPesewa: 19000, expectedPesewa: 19300, variancePesewa: -300 });
  });
});

describe('costs', () => {
  it('records a bill through the validated schema and lists it back', async () => {
    const input = costSchema.parse({ category: 'gas', label: 'Refill', amount: '80', incurredOn: '2026-09-28' });
    const added = await addCost(db, input, session);
    expect(added.ok).toBe(true);
    const week = await listCosts(db, fx.shopId, new Date('2026-09-28T00:00:00Z'), new Date('2026-09-28T23:59:59Z'));
    expect(week.some((c) => c.label === 'Refill' && c.amount === 8000)).toBe(true);
  });
});

describe('activityFeed', () => {
  it('shows every kind of event, newest first', async () => {
    const feed = await activityFeed(db, fx.shopId, { day: new Date('2026-09-28T00:00:00Z') });
    const kinds = new Set(feed.map((f) => f.kind));
    expect([...kinds].sort()).toEqual(['cost', 'order', 'payment', 'shift', 'sms', 'status']);
    for (let i = 1; i < feed.length; i += 1) {
      expect(feed[i - 1]!.at.getTime()).toBeGreaterThanOrEqual(feed[i]!.at.getTime());
    }
    const statusLine = feed.find((f) => f.kind === 'status');
    expect(statusLine?.text).toContain('Owner marked');
    expect(statusLine?.text).toContain('received → washing');
    expect(feed.every((f) => f.kind !== 'order' || f.orderId)).toBe(true);
  });

  it('filters by kind, actor and day', async () => {
    const payments = await activityFeed(db, fx.shopId, { kind: 'payment' });
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((f) => f.kind === 'payment')).toBe(true);

    const byOwner = await activityFeed(db, fx.shopId, { staffId: fx.staffId });
    expect(byOwner.length).toBeGreaterThan(0);
    expect(byOwner.every((f) => f.who === 'Owner' || f.who === null)).toBe(true);

    const august = await activityFeed(db, fx.shopId, { day: new Date('2026-08-15T00:00:00Z') });
    expect(august.map((f) => f.kind)).toEqual(['order']);
  });
});
