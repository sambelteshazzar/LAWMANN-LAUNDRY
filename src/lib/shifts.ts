import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import type { ShiftCloseInput, ShiftOpenInput } from '@/lib/validation';
import type { Session } from '@/lib/auth';

/**
 * The cash drawer. One shift open at a time; closing compares what was
 * counted against what should be there: the float plus every confirmed cash
 * payment taken while the shift was open. Pending MoMo is not cash in the
 * drawer and never enters the arithmetic.
 */

export type ShiftRow = typeof schema.shift.$inferSelect;

export interface OpenShift extends ShiftRow {
  staffName: string;
}

export async function currentShift(db: Db, shopId: string): Promise<OpenShift | null> {
  const rows = await db
    .select({ shift: schema.shift, staffName: schema.staff.name })
    .from(schema.shift)
    .innerJoin(schema.staff, eq(schema.shift.staffId, schema.staff.id))
    .where(and(eq(schema.staff.shopId, shopId), isNull(schema.shift.closedAt)))
    .orderBy(desc(schema.shift.openedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row.shift, staffName: row.staffName };
}

export async function openShift(
  db: Db,
  input: ShiftOpenInput,
  session: Session,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const existing = await currentShift(db, session.shopId);
  if (existing) {
    return { ok: false, error: `A shift is already open (opened by ${existing.staffName}). Close it first.` };
  }
  const rows = await db
    .insert(schema.shift)
    .values({ staffId: session.staffId, float: input.float })
    .returning({ id: schema.shift.id });
  const id = rows[0]?.id;
  if (!id) return { ok: false, error: 'Could not open the shift.' };
  return { ok: true, id };
}

export interface ShiftClose {
  countedPesewa: number;
  expectedPesewa: number;
  variancePesewa: number;
}

export async function closeShift(
  db: Db,
  shiftId: string,
  input: ShiftCloseInput,
  session: Session,
): Promise<{ ok: true; close: ShiftClose } | { ok: false; error: string }> {
  const rows = await db
    .select({ shift: schema.shift, shopId: schema.staff.shopId })
    .from(schema.shift)
    .innerJoin(schema.staff, eq(schema.shift.staffId, schema.staff.id))
    .where(eq(schema.shift.id, shiftId));
  const found = rows[0];
  if (!found || found.shopId !== session.shopId) return { ok: false, error: 'Shift not found.' };
  if (found.shift.closedAt) return { ok: false, error: 'That shift is already closed.' };

  const now = new Date();
  const cash = await db
    .select({ total: sql<string | null>`sum(${schema.payment.amount})` })
    .from(schema.payment)
    .innerJoin(schema.orders, eq(schema.payment.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.orders.shopId, session.shopId),
        eq(schema.payment.method, 'cash'),
        eq(schema.payment.state, 'confirmed'),
        sql`${schema.payment.paidAt} >= ${found.shift.openedAt}`,
        sql`${schema.payment.paidAt} <= ${now}`,
      ),
    );
  const cashTaken = Number(cash[0]?.total ?? 0);
  const expected = found.shift.float + cashTaken;
  const counted = input.counted;

  await db
    .update(schema.shift)
    .set({ closedAt: now, counted, momoAtClose: input.momoAtClose ?? null })
    .where(eq(schema.shift.id, shiftId));

  return { ok: true, close: { countedPesewa: counted, expectedPesewa: expected, variancePesewa: counted - expected } };
}
