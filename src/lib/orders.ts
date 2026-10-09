import { and, desc, eq, inArray, like } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import { translateDbError } from '@/lib/errors';
import { splitTaxInclusive } from '@/lib/tax';
import { PIECES, priceAgainstBands } from '@/lib/pricing';
import type { Grams, Pesewas } from '@/lib/money';
import { normalizePhone, type IntakeInput, type PaymentInput } from '@/lib/validation';
import type { Session } from '@/lib/auth';
import { acceptedMessage, paymentMessage, readyMessage } from '@/lib/sms/templates';
import { attemptSend, enqueueSms } from '@/lib/sms/outbox';

/**
 * The money flow: intake, status moves, payments. Every function takes the
 * database first so tests run against a throwaway Postgres; actions pass
 * the singleton.
 *
 * Two rules govern everything here. The gross is recomputed server-side on
 * every creation: the client's quoted price is display-only and never
 * trusted. And the database is the final judge: known law violations come
 * back as { ok: false } with the trigger's own words; anything else throws.
 */

export type OrderStatus = typeof schema.orders.$inferSelect['status'];

export type OrderResult =
  | { ok: true; orderId: string; orderNo: string }
  | { ok: false; error: string; orderId?: string; orderNo?: string };

export interface OrderSummary {
  id: string;
  orderNo: string;
  status: OrderStatus;
  weightGrams: number;
  grossPesewa: number;
  balancePesewa: number;
  studentName: string | null;
  studentPhone: string;
  createdAt: Date;
}

export interface OrderDetail {
  order: typeof schema.orders.$inferSelect;
  student: typeof schema.student.$inferSelect;
  location: typeof schema.location.$inferSelect;
  payments: Array<typeof schema.payment.$inferSelect>;
  events: Array<{ from: OrderStatus; to: OrderStatus; staffName: string; at: Date }>;
  paidPesewa: number;
  balancePesewa: number;
}

function failure(error: string, partial?: { orderId: string; orderNo: string }): OrderResult {
  return partial ? { ok: false, error, ...partial } : { ok: false, error };
}

/** Bands live in the database so the owner can change prices without a code change.
 *  The gap rule itself lives in pricing.ts, shared with the live quote at intake. */
async function bandPrice(db: Db, weightGrams: Grams): Promise<{ price: Pesewas } | { missing: string }> {
  const rows = await db.select().from(schema.band).where(eq(schema.band.active, true)).orderBy(schema.band.toGrams);
  return priceAgainstBands(
    rows.map((r) => ({ toGrams: r.toGrams, pricePesewa: r.price })),
    weightGrams,
  );
}

function pieceTotal(lines: NonNullable<IntakeInput['pieces']>): { total: Pesewas } | { missing: string } {
  if (lines.length === 0) return { missing: 'No items selected.' };
  let total = 0;
  for (const line of lines) {
    const item = PIECES.find((p) => p.code === line.code);
    if (!item) return { missing: `${line.code} is not on the price list.` };
    total += item.price * line.qty;
  }
  return { total: total as Pesewas };
}

async function upsertStudent(
  db: Db,
  shopId: string,
  phone: string,
  name: string | undefined,
  room: string | undefined,
): Promise<typeof schema.student.$inferSelect> {
  const existing = await db
    .select()
    .from(schema.student)
    .where(and(eq(schema.student.shopId, shopId), eq(schema.student.phone, phone)));
  const found = existing[0];
  if (found) {
    const patch: Partial<typeof schema.student.$inferInsert> = {};
    if (name && name !== found.name) patch.name = name;
    if (room && room !== found.room) patch.room = room;
    if (Object.keys(patch).length > 0) {
      const updated = await db.update(schema.student).set(patch).where(eq(schema.student.id, found.id)).returning();
      return updated[0]!;
    }
    return found;
  }
  const inserted = await db
    .insert(schema.student)
    .values({ shopId, phone, name: name || null, room: room || null })
    .returning();
  const created = inserted[0];
  if (!created) throw new Error('student insert failed');
  return created;
}

/** LW-YYMMDD-NNN, per shop, per day. Retried on collision by the caller. */
export async function nextOrderNo(db: Db, shopId: string, date: Date): Promise<string> {
  const prefix = `LW-${String(date.getUTCFullYear()).slice(2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
    date.getUTCDate(),
  ).padStart(2, '0')}-`;
  const rows = await db
    .select({ orderNo: schema.orders.orderNo })
    .from(schema.orders)
    .where(and(eq(schema.orders.shopId, shopId), like(schema.orders.orderNo, `${prefix}%`)));
  let n = 0;
  for (const row of rows) {
    const v = Number(row.orderNo.slice(prefix.length));
    if (Number.isInteger(v) && v > n) n = v;
  }
  return `${prefix}${String(n + 1).padStart(3, '0')}`;
}

async function balancesFor(db: Db, orderId: string): Promise<{ paid: number; balance: number }> {
  const { rows } = await db.$client.query<{ paid_pesewa: string | number; balance_due: string | number }>(
    'SELECT paid_pesewa, balance_due FROM order_balances WHERE id = $1',
    [orderId],
  );
  const row = rows[0];
  if (!row) throw new Error('order_balances has no row for a live order');
  return { paid: Number(row.paid_pesewa), balance: Number(row.balance_due) };
}

async function findOrder(db: Db, shopId: string, orderId: string) {
  const rows = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.shopId, shopId)));
  return rows[0] ?? null;
}

export async function createOrder(db: Db, input: IntakeInput, session: Session): Promise<OrderResult> {
  const weightGrams = input.weightKg as Grams;

  let gross: Pesewas;
  if (input.method === 'band') {
    const priced = await bandPrice(db, weightGrams);
    if ('missing' in priced) return failure(priced.missing);
    gross = priced.price;
  } else {
    const total = pieceTotal(input.pieces ?? []);
    if ('missing' in total) return failure(total.missing);
    gross = total.total;
  }

  const student = await upsertStudent(db, session.shopId, input.phone, input.name || undefined, input.room || undefined);
  const split = splitTaxInclusive(gross);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const orderNo = await nextOrderNo(db, session.shopId, new Date());
    try {
      const inserted = await db
        .insert(schema.orders)
        .values({
          id: input.orderId,
          shopId: session.shopId,
          orderNo,
          locationId: input.locationId,
          studentId: student.id,
          recordedBy: session.staffId,
          status: 'received',
          weightGrams,
          method: input.method,
          gross,
          base: split.base,
          vat: split.vat,
          nhil: split.nhil,
          getfund: split.getfund,
          promisedAt: input.promisedOn ? new Date(`${input.promisedOn}T12:00:00Z`) : null,
        })
        .returning({ id: schema.orders.id });
      const orderId = inserted[0]?.id;
      if (!orderId) throw new Error('order insert returned no row');

      let paidAllStates = 0;
      if (input.payment) {
        const pay = input.payment;
        if (pay.method === 'momo' && !pay.gatewayRef) {
          return failure('The MoMo transaction ref is on the confirmation SMS.', { orderId, orderNo });
        }
        try {
          await db.insert(schema.payment).values({
            orderId,
            amount: pay.amount as Pesewas,
            method: pay.method,
            recordedBy: session.staffId,
            state: pay.method === 'cash' ? 'confirmed' : 'pending_momo',
            gatewayRef: pay.gatewayRef ?? null,
            paidAt: new Date(),
          });
          paidAllStates = pay.amount;
        } catch (err) {
          const law = translateDbError(err);
          if (law?.code === 'replay') {
            paidAllStates = pay.amount;
          } else if (law) {
            return failure(law.message, { orderId, orderNo });
          } else {
            throw err;
          }
        }
      }

      await enqueueSms(db, {
        shopId: session.shopId,
        orderId,
        kind: 'accepted',
        toPhone: student.phone,
        body: acceptedMessage({
          name: student.name,
          weightGrams,
          grossPesewa: gross,
          paidAllStatesPesewa: paidAllStates as Pesewas,
          orderNo,
        }),
      });
      await attemptSend(db);
      return { ok: true, orderId, orderNo };
    } catch (err) {
      const law = translateDbError(err);
      if (law?.code === 'replay') {
        const existing = await findOrder(db, session.shopId, input.orderId);
        if (existing) return { ok: true, orderId: existing.id, orderNo: existing.orderNo };
        return failure('This order was already recorded.');
      }
      if (law?.code === 'order_no_race') continue;
      if (law) return failure(law.message);
      throw err;
    }
  }
  return failure('Order number collision. Try saving again.');
}

export async function advanceStatus(db: Db, orderId: string, to: OrderStatus, session: Session): Promise<OrderResult> {
  const order = await findOrder(db, session.shopId, orderId);
  if (!order) return failure('Order not found.');
  if (order.status === to) return { ok: true, orderId, orderNo: order.orderNo };

  try {
    await db
      .update(schema.orders)
      .set({
        status: to,
        readyAt: to === 'ready' ? new Date() : order.readyAt,
        collectedAt: to === 'collected' ? new Date() : order.collectedAt,
      })
      .where(eq(schema.orders.id, orderId));
  } catch (err) {
    const law = translateDbError(err);
    if (law) return failure(law.message);
    throw err;
  }

  await db.insert(schema.orderEvent).values({ orderId, fromStatus: order.status, toStatus: to, staffId: session.staffId });

  if (to === 'ready') {
    const students = await db.select().from(schema.student).where(eq(schema.student.id, order.studentId));
    const phone = students[0]?.phone;
    if (phone) {
      await enqueueSms(db, { shopId: session.shopId, orderId, kind: 'ready', toPhone: phone, body: readyMessage(order.orderNo) });
      await attemptSend(db);
    }
  }
  return { ok: true, orderId, orderNo: order.orderNo };
}

export async function takePayment(db: Db, orderId: string, input: PaymentInput, session: Session): Promise<OrderResult> {
  const order = await findOrder(db, session.shopId, orderId);
  if (!order) return failure('Order not found.');
  if (input.method === 'momo' && !input.gatewayRef) {
    return failure('The MoMo transaction ref is on the confirmation SMS.');
  }

  try {
    await db.insert(schema.payment).values({
      orderId,
      amount: input.amount as Pesewas,
      method: input.method,
      recordedBy: session.staffId,
      state: input.method === 'cash' ? 'confirmed' : 'pending_momo',
      gatewayRef: input.gatewayRef ?? null,
      paidAt: new Date(),
    });
  } catch (err) {
    const law = translateDbError(err);
    if (law?.code === 'replay') return { ok: true, orderId, orderNo: order.orderNo };
    if (law) return failure(law.message);
    throw err;
  }

  if (input.method === 'cash') {
    const { balance } = await balancesFor(db, orderId);
    const students = await db.select().from(schema.student).where(eq(schema.student.id, order.studentId));
    const phone = students[0]?.phone;
    if (phone) {
      await enqueueSms(db, {
        shopId: session.shopId,
        orderId,
        kind: 'payment',
        toPhone: phone,
        body: paymentMessage(input.amount as Pesewas, order.orderNo, balance as Pesewas),
      });
      await attemptSend(db);
    }
  }
  return { ok: true, orderId, orderNo: order.orderNo };
}

export async function confirmMomoPayment(db: Db, paymentId: string, session: Session): Promise<OrderResult> {
  const rows = await db.select().from(schema.payment).where(eq(schema.payment.id, paymentId));
  const pay = rows[0];
  if (!pay) return failure('Payment not found.');
  const order = await findOrder(db, session.shopId, pay.orderId);
  if (!order) return failure('Order not found.');
  if (pay.state === 'confirmed') return failure('That payment is already confirmed.');
  if (pay.state === 'reversed') return failure('That payment was reversed and cannot be confirmed.');

  try {
    await db.update(schema.payment).set({ state: 'confirmed' }).where(eq(schema.payment.id, paymentId));
  } catch (err) {
    const law = translateDbError(err);
    if (law) return failure(law.message);
    throw err;
  }

  const { balance } = await balancesFor(db, order.id);
  const students = await db.select().from(schema.student).where(eq(schema.student.id, order.studentId));
  const phone = students[0]?.phone;
  if (phone) {
    await enqueueSms(db, {
      shopId: session.shopId,
      orderId: order.id,
      kind: 'payment',
      toPhone: phone,
      body: paymentMessage(pay.amount as Pesewas, order.orderNo, balance as Pesewas),
    });
    await attemptSend(db);
  }
  return { ok: true, orderId: order.id, orderNo: order.orderNo };
}

export async function cancelOrder(db: Db, orderId: string, session: Session): Promise<OrderResult> {
  const order = await findOrder(db, session.shopId, orderId);
  if (!order) return failure('Order not found.');
  if (order.status === 'cancelled') return failure('That order is already cancelled.');
  if (order.status === 'collected') return failure('A collected order cannot be cancelled.');

  try {
    await db.update(schema.orders).set({ status: 'cancelled' }).where(eq(schema.orders.id, orderId));
  } catch (err) {
    const law = translateDbError(err);
    if (law) return failure(law.message);
    throw err;
  }
  await db.insert(schema.orderEvent).values({ orderId, fromStatus: order.status, toStatus: 'cancelled', staffId: session.staffId });
  return { ok: true, orderId, orderNo: order.orderNo };
}

export async function getOrderDetail(db: Db, orderId: string, session: Session): Promise<OrderDetail | null> {
  const order = await findOrder(db, session.shopId, orderId);
  if (!order) return null;
  const [students, locations, payments, events] = await Promise.all([
    db.select().from(schema.student).where(eq(schema.student.id, order.studentId)),
    db.select().from(schema.location).where(eq(schema.location.id, order.locationId)),
    db.select().from(schema.payment).where(eq(schema.payment.orderId, orderId)).orderBy(schema.payment.paidAt),
    db.select({ event: schema.orderEvent, staffName: schema.staff.name }).from(schema.orderEvent).innerJoin(schema.staff, eq(schema.orderEvent.staffId, schema.staff.id)).where(eq(schema.orderEvent.orderId, orderId)).orderBy(schema.orderEvent.at),
  ]);
  const student = students[0];
  const location = locations[0];
  if (!student || !location) return null;
  const { paid, balance } = await balancesFor(db, orderId);
  return {
    order,
    student,
    location,
    payments,
    events: events.map((e) => ({ from: e.event.fromStatus, to: e.event.toStatus, staffName: e.staffName, at: e.event.at })),
    paidPesewa: paid,
    balancePesewa: balance,
  };
}

export type OrderListFilter = 'open' | 'all' | OrderStatus;

export async function listOrders(db: Db, session: Session, filter: OrderListFilter = 'open'): Promise<OrderSummary[]> {
  const statusFilter =
    filter === 'all' ? undefined : filter === 'open' ? (['received', 'washing', 'ready'] as OrderStatus[]) : [filter];
  const rows = await db
    .select({ order: schema.orders, studentName: schema.student.name, studentPhone: schema.student.phone })
    .from(schema.orders)
    .innerJoin(schema.student, eq(schema.orders.studentId, schema.student.id))
    .where(
      statusFilter
        ? and(eq(schema.orders.shopId, session.shopId), inArray(schema.orders.status, statusFilter))
        : eq(schema.orders.shopId, session.shopId),
    )
    .orderBy(desc(schema.orders.createdAt))
    .limit(200);

  const summaries: OrderSummary[] = [];
  for (const row of rows) {
    const { balance } = await balancesFor(db, row.order.id);
    summaries.push({
      id: row.order.id,
      orderNo: row.order.orderNo,
      status: row.order.status,
      weightGrams: row.order.weightGrams,
      grossPesewa: row.order.gross,
      balancePesewa: balance,
      studentName: row.studentName,
      studentPhone: row.studentPhone,
      createdAt: row.order.createdAt,
    });
  }
  return summaries;
}

export interface StudentLookup {
  student: typeof schema.student.$inferSelect;
  openBalancePesewa: number;
  oldestOpen: { orderNo: string; balancePesewa: number } | null;
}

export async function findStudentByPhone(db: Db, shopId: string, rawPhone: string): Promise<StudentLookup | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const students = await db
    .select()
    .from(schema.student)
    .where(and(eq(schema.student.shopId, shopId), eq(schema.student.phone, phone)));
  const student = students[0];
  if (!student) return null;

  const open = await db
    .select({ order: schema.orders })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.shopId, shopId),
        eq(schema.orders.studentId, student.id),
        inArray(schema.orders.status, ['received', 'washing', 'ready']),
      ),
    )
    .orderBy(schema.orders.createdAt);

  let openBalance = 0;
  let oldestOpen: StudentLookup['oldestOpen'] = null;
  for (const row of open) {
    const { balance } = await balancesFor(db, row.order.id);
    if (balance <= 0) continue;
    openBalance += balance;
    oldestOpen ??= { orderNo: row.order.orderNo, balancePesewa: balance };
  }
  return { student, openBalancePesewa: openBalance, oldestOpen };
}
