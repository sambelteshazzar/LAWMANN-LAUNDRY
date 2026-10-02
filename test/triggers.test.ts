import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import { splitTaxInclusive } from '@/lib/tax';
import { freshDb, legalOrder, seededShop, type ShopFixture, type TestDb } from './db';

/**
 * The schema's laws, enforced by triggers and constraints, verified against
 * real Postgres. If one of these tests fails, the app's core mechanic has
 * broken; no TypeScript change can fix it, and nothing above the database
 * may work around it.
 */

let client: PGlite;
let db: TestDb;
let fx: ShopFixture;

beforeAll(async () => {
  db = await freshDb();
  client = db.$client;
  fx = await seededShop(db, client);
});

afterAll(async () => {
  await client.close();
});

describe('payment_within_balance', () => {
  it('rejects a payment that exceeds the balance owing', async () => {
    const order = await legalOrder(fx, { grossPesewa: 9300 });
    await expect(
      db.insert(schema.payment).values({
        orderId: order.id,
        amount: 9400,
        method: 'cash',
        state: 'confirmed',
        paidAt: new Date(),
      }),
    ).rejects.toThrow(/exceeds the remaining balance/);
  });

  it('accepts a payment exactly equal to the balance, then rejects the next one', async () => {
    const order = await legalOrder(fx, { grossPesewa: 9300 });
    await db.insert(schema.payment).values({
      orderId: order.id,
      amount: 9300,
      method: 'cash',
      state: 'confirmed',
      paidAt: new Date(),
    });
    await expect(
      db.insert(schema.payment).values({
        orderId: order.id,
        amount: 500,
        method: 'cash',
        state: 'confirmed',
        paidAt: new Date(),
      }),
    ).rejects.toThrow(/exceeds the remaining balance/);
  });

  it('counts only unreversed payments toward the settled amount', async () => {
    const order = await legalOrder(fx, { grossPesewa: 9300 });
    await db.insert(schema.payment).values({
      orderId: order.id,
      amount: 5000,
      method: 'momo',
      state: 'reversed',
      paidAt: new Date(),
    });
    await db.insert(schema.payment).values({
      orderId: order.id,
      amount: 9300,
      method: 'cash',
      state: 'confirmed',
      paidAt: new Date(),
    });
  });

  it('excludes the row being updated, so updating a payment does not collide with itself', async () => {
    const order = await legalOrder(fx, { grossPesewa: 9300 });
    const payments = await db
      .insert(schema.payment)
      .values({ orderId: order.id, amount: 5000, method: 'cash', state: 'confirmed', paidAt: new Date() })
      .returning();
    await db.update(schema.payment).set({ amount: 9300 }).where(eq(schema.payment.id, payments[0]!.id));
  });

  it('order_balances reports paid and balance correctly', async () => {
    const order = await legalOrder(fx, { grossPesewa: 9300 });
    await db.insert(schema.payment).values({
      orderId: order.id,
      amount: 3000,
      method: 'momo',
      state: 'pending_momo',
      paidAt: new Date(),
    });
    const { rows } = await client.query<{ paid_pesewa: number; balance_due: number }>(
      'SELECT paid_pesewa, balance_due FROM order_balances WHERE id = $1',
      [order.id],
    );
    expect(Number(rows[0]!.paid_pesewa)).toBe(3000);
    expect(Number(rows[0]!.balance_due)).toBe(6300);
  });
});

describe('forward_only_status', () => {
  it('allows the documented forward moves', async () => {
    const order = await legalOrder(fx);
    await db.update(schema.orders).set({ status: 'washing' }).where(eq(schema.orders.id, order.id));
    await db.update(schema.orders).set({ status: 'ready', readyAt: new Date() }).where(eq(schema.orders.id, order.id));
    await db.update(schema.orders).set({ status: 'collected', collectedAt: new Date() }).where(eq(schema.orders.id, order.id));
  });

  it('rejects a backwards move', async () => {
    const order = await legalOrder(fx);
    await db.update(schema.orders).set({ status: 'washing' }).where(eq(schema.orders.id, order.id));
    await expect(db.update(schema.orders).set({ status: 'received' }).where(eq(schema.orders.id, order.id))).rejects.toThrow(
      /cannot move backwards/,
    );
  });

  it('freezes collected and cancelled orders', async () => {
    const collected = await legalOrder(fx);
    await db.update(schema.orders).set({ status: 'ready', readyAt: new Date() }).where(eq(schema.orders.id, collected.id));
    await db.update(schema.orders).set({ status: 'collected', collectedAt: new Date() }).where(eq(schema.orders.id, collected.id));
    await expect(db.update(schema.orders).set({ status: 'washing' }).where(eq(schema.orders.id, collected.id))).rejects.toThrow(
      /is collected and cannot move/,
    );

    const cancelled = await legalOrder(fx);
    await db.update(schema.orders).set({ status: 'cancelled' }).where(eq(schema.orders.id, cancelled.id));
    await expect(db.update(schema.orders).set({ status: 'ready' }).where(eq(schema.orders.id, cancelled.id))).rejects.toThrow(
      /is cancelled and cannot move/,
    );
  });

  it('allows cancelling an open order', async () => {
    const order = await legalOrder(fx);
    await db.update(schema.orders).set({ status: 'cancelled' }).where(eq(schema.orders.id, order.id));
  });

  it('a no-op status update passes', async () => {
    const order = await legalOrder(fx);
    await db.update(schema.orders).set({ status: 'received' }).where(eq(schema.orders.id, order.id));
  });
});

describe('order table laws', () => {
  it('rejects a tax split that does not foot to the gross', async () => {
    const split = splitTaxInclusive(9300);
    await expect(
      db.insert(schema.orders).values({
        id: crypto.randomUUID(),
        shopId: fx.shopId,
        orderNo: crypto.randomUUID(),
        locationId: fx.locationId,
        studentId: fx.studentId,
        weightGrams: 3500,
        method: 'band',
        gross: 9300,
        base: split.base + 1,
        vat: split.vat,
        nhil: split.nhil,
        getfund: split.getfund,
      }),
    ).rejects.toThrow(/orders_tax_foots/);
  });

  it('rejects a non-positive weight', async () => {
    const split = splitTaxInclusive(9300);
    await expect(
      db.insert(schema.orders).values({
        id: crypto.randomUUID(),
        shopId: fx.shopId,
        orderNo: crypto.randomUUID(),
        locationId: fx.locationId,
        studentId: fx.studentId,
        weightGrams: 0,
        method: 'band',
        gross: 9300,
        base: split.base,
        vat: split.vat,
        nhil: split.nhil,
        getfund: split.getfund,
      }),
    ).rejects.toThrow(/orders_weight_positive/);
  });
});

describe('idempotency keys', () => {
  it('a replayed MoMo transaction reference collides, as designed', async () => {
    const order = await legalOrder(fx);
    const row = { orderId: order.id, amount: 1000, method: "momo" as const, state: "pending_momo" as const, gatewayRef: 'MP260928.1234.A1', paidAt: new Date() };
    await db.insert(schema.payment).values(row);
    await expect(db.insert(schema.payment).values(row)).rejects.toThrow();
  });

  it('a replayed order id collides, as designed', async () => {
    const id = crypto.randomUUID();
    await legalOrder(fx, { id });
    await expect(legalOrder(fx, { id, grossPesewa: 7300 })).rejects.toThrow();
  });
});
