import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import type { Grams, Pesewas } from '@/lib/money';
import { gapRowLabel } from '@/lib/pricing';

/**
 * The owner's six questions plus the profit side, as queries. Two standing
 * rules: confirmed and pending-MoMo money are never mixed, and bigint
 * arrives as a string on node-postgres but a number on PGlite, so every
 * aggregate passes through Number() at the boundary.
 *
 * Day boundaries are UTC. Ghana runs on GMT with no daylight saving, so a
 * UTC day is a Ghana day — no timezone table needed.
 */

export interface Range {
  from: Date;
  to: Date;
}

export interface MoneySummary {
  confirmedPesewa: number;
  confirmedCount: number;
  pendingPesewa: number;
  pendingCount: number;
}

export interface IntakeCounts {
  day: number;
  week: number;
  month: number;
}

export interface ArrearsRow {
  orderId: string;
  orderNo: string;
  status: string;
  grossPesewa: number;
  paidPesewa: number;
  balancePesewa: number;
  studentName: string | null;
  studentPhone: string;
  studentRoom: string | null;
  createdAt: Date;
}

export interface TaxSummary {
  basePesewa: number;
  vatPesewa: number;
  nhilPesewa: number;
  getfundPesewa: number;
}

export interface CostPerKilo {
  kilosGrams: number;
  costPesewa: number;
  perKiloPesewa: number | null;
}

export interface BandMixRow {
  band: string;
  orders: number;
  kilosGrams: number;
  revenuePesewa: number;
  perKiloPesewa: number;
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfWeekMondayUTC(d: Date): Date {
  const day = startOfDayUTC(d);
  const dow = day.getUTCDay(); // 0 Sunday .. 6 Saturday
  const back = (dow + 6) % 7; // days since Monday
  return new Date(day.getTime() - back * 24 * 60 * 60 * 1000);
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function paymentsIn(
  db: Db,
  shopId: string,
  state: 'confirmed' | 'pending_momo',
  from: Date,
  to?: Date,
): Promise<{ total: number; count: number }> {
  const conds = [
    eq(schema.orders.shopId, shopId),
    eq(schema.payment.state, state),
    gte(schema.payment.paidAt, from),
  ];
  if (to) conds.push(lte(schema.payment.paidAt, to));
  const rows = await db
    .select({ total: sql<string | number | null>`sum(${schema.payment.amount})`, count: sql<string | number>`count(*)` })
    .from(schema.payment)
    .innerJoin(schema.orders, eq(schema.payment.orderId, schema.orders.id))
    .where(and(...conds));
  const row = rows[0];
  return { total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
}

export async function moneyToday(db: Db, shopId: string, now: Date): Promise<MoneySummary> {
  const start = startOfDayUTC(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const confirmed = await paymentsIn(db, shopId, 'confirmed', start, end);
  const pending = await paymentsIn(db, shopId, 'pending_momo', start, end);
  return {
    confirmedPesewa: confirmed.total,
    confirmedCount: confirmed.count,
    pendingPesewa: pending.total,
    pendingCount: pending.count,
  };
}

/** Confirmed money inside an arbitrary range, for the reports page. */
export async function revenueInRange(db: Db, shopId: string, range: Range): Promise<{ confirmedPesewa: number; confirmedCount: number }> {
  const result = await paymentsIn(db, shopId, 'confirmed', range.from, range.to);
  return { confirmedPesewa: result.total, confirmedCount: result.count };
}

export async function intakeCounts(db: Db, shopId: string, now: Date): Promise<IntakeCounts> {
  const countSince = async (from: Date): Promise<number> => {
    const rows = await db
      .select({ count: sql<string | number>`count(*)` })
      .from(schema.orders)
      .where(and(eq(schema.orders.shopId, shopId), gte(schema.orders.createdAt, from)));
    return Number(rows[0]?.count ?? 0);
  };
  const [day, week, month] = await Promise.all([
    countSince(startOfDayUTC(now)),
    countSince(startOfWeekMondayUTC(now)),
    countSince(startOfMonthUTC(now)),
  ]);
  return { day, week, month };
}

/** Open orders grouped by status, for the dashboard's "bags in the shop" row. */
export async function statusCounts(db: Db, shopId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: schema.orders.status, count: sql<string | number>`count(*)` })
    .from(schema.orders)
    .where(eq(schema.orders.shopId, shopId))
    .groupBy(schema.orders.status);
  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = Number(row.count);
  return out;
}

interface ArrearsQueryRow {
  id: string;
  order_no: string;
  status: string;
  gross_pesewa: string | number;
  paid_pesewa: string | number;
  balance_due: string | number;
  created_at: Date;
  student_name: string | null;
  student_phone: string;
  student_room: string | null;
}

export async function arrearsList(db: Db, shopId: string): Promise<ArrearsRow[]> {
  const { rows } = await db.$client.query<ArrearsQueryRow>(
    `SELECT b.id, b.order_no, o.status, b.gross_pesewa, b.paid_pesewa, b.balance_due,
            o.created_at, s.name AS student_name, s.phone AS student_phone, s.room AS student_room
     FROM order_balances b
     JOIN orders o ON o.id = b.id
     JOIN student s ON s.id = b.student_id
     WHERE b.shop_id = $1 AND b.balance_due > 0 AND o.status IN ('received', 'washing', 'ready')
     ORDER BY o.created_at ASC`,
    [shopId],
  );
  return rows.map((r) => ({
    orderId: r.id,
    orderNo: r.order_no,
    status: r.status,
    grossPesewa: Number(r.gross_pesewa),
    paidPesewa: Number(r.paid_pesewa),
    balancePesewa: Number(r.balance_due),
    studentName: r.student_name,
    studentPhone: r.student_phone,
    studentRoom: r.student_room,
    createdAt: r.created_at,
  }));
}

export async function taxSummary(db: Db, shopId: string, range: Range): Promise<TaxSummary> {
  const rows = await db
    .select({
      base: sql<string | number | null>`sum(${schema.orders.base})`,
      vat: sql<string | number | null>`sum(${schema.orders.vat})`,
      nhil: sql<string | number | null>`sum(${schema.orders.nhil})`,
      getfund: sql<string | number | null>`sum(${schema.orders.getfund})`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.shopId, shopId),
        gte(schema.orders.createdAt, range.from),
        lte(schema.orders.createdAt, range.to),
      ),
    );
  const row = rows[0];
  return {
    basePesewa: Number(row?.base ?? 0),
    vatPesewa: Number(row?.vat ?? 0),
    nhilPesewa: Number(row?.nhil ?? 0),
    getfundPesewa: Number(row?.getfund ?? 0),
  };
}

export async function costPerKilo(db: Db, shopId: string, range: Range): Promise<CostPerKilo> {
  const [kilos, costs] = await Promise.all([
    db
      .select({ grams: sql<string | number | null>`sum(${schema.orders.weightGrams})` })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.shopId, shopId),
          gte(schema.orders.createdAt, range.from),
          lte(schema.orders.createdAt, range.to),
        ),
      ),
    db
      .select({ total: sql<string | number | null>`sum(${schema.operatingCost.amount})` })
      .from(schema.operatingCost)
      .where(
        and(
          eq(schema.operatingCost.shopId, shopId),
          gte(schema.operatingCost.incurredOn, range.from.toISOString().slice(0, 10)),
          lte(schema.operatingCost.incurredOn, range.to.toISOString().slice(0, 10)),
        ),
      ),
  ]);
  const kilosGrams = Number(kilos[0]?.grams ?? 0);
  const costPesewa = Number(costs[0]?.total ?? 0);
  return {
    kilosGrams,
    costPesewa,
    perKiloPesewa: kilosGrams > 0 ? Math.round((costPesewa * 1000) / kilosGrams) : null,
  };
}

export async function bandMix(db: Db, shopId: string, range: Range): Promise<BandMixRow[]> {
  const [orderRows, bands] = await Promise.all([
    db
      .select({ weightGrams: schema.orders.weightGrams, gross: schema.orders.gross })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.shopId, shopId),
          gte(schema.orders.createdAt, range.from),
          lte(schema.orders.createdAt, range.to),
        ),
      ),
    db.select().from(schema.band).where(eq(schema.band.active, true)).orderBy(schema.band.toGrams),
  ]);

  const buckets = new Map<string, { orders: number; kilosGrams: number; revenuePesewa: number }>();
  for (const row of orderRows) {
    // Orders bucket the way they were priced: a 3.5kg bag is a 3kg bag plus
    // the gap surcharge, so it lands in the gap row, not the next band up.
    const whole = Math.floor((row.weightGrams as Grams) / 1000) * 1000;
    const band = bands.find((b) => whole <= b.toGrams);
    const gap = band !== undefined && (row.weightGrams as Grams) > band.toGrams;
    // A deactivated band must never silently drop revenue from the table.
    const label = band ? (gap ? gapRowLabel(band.toGrams) : `Up to ${band.toGrams / 1000}kg`) : 'No band';
    const bucket = buckets.get(label) ?? { orders: 0, kilosGrams: 0, revenuePesewa: 0 };
    bucket.orders += 1;
    bucket.kilosGrams += row.weightGrams;
    bucket.revenuePesewa += row.gross;
    buckets.set(label, bucket);
  }
  const rows = [...buckets.entries()].map(([band, b]) => ({
    band,
    orders: b.orders,
    kilosGrams: b.kilosGrams,
    revenuePesewa: b.revenuePesewa,
    perKiloPesewa: Math.round((b.revenuePesewa * 1000) / b.kilosGrams) as Pesewas,
  }));
  // Biggest band first: the bands that matter most lead the table.
  return rows.sort((a, b) => b.revenuePesewa - a.revenuePesewa);
}
