import { and, asc, eq, sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import { translateDbError } from '@/lib/errors';
import { splitTaxInclusive } from '@/lib/tax';
import { priceAgainstBands } from '@/lib/pricing';
import { normalizePhone } from '@/lib/validation';
import { moneyShort, weightLabel, type Grams, type Pesewas } from '@/lib/money';
import { correctedMessage } from '@/lib/sms/templates';
import { attemptSend, enqueueSms } from '@/lib/sms/outbox';
import { upsertStudent } from '@/lib/orders';
import type { Session } from '@/lib/auth';

/**
 * The repair flow. A mis-keyed weight, a wrong student attached by a typo'd
 * phone, a mistyped total: all fixed in place, with the mistake still
 * visible. The bag record is corrected atomically, one audit row per changed
 * field, and the student hears about it when the money moved.
 *
 * Three rules hold. The gross is always recomputed here, never trusted from
 * the form. The diff is written, not inferred later: one row per field with
 * the human form of the old and new value, and the reason on every row. And
 * a collected or cancelled order keeps its figures, because the money has
 * already moved.
 */

export type CorrectionField = 'weight' | 'price' | 'student' | 'location' | 'promised_date';

export interface CorrectionInput {
  readonly method: 'band' | 'piece';
  readonly weightGrams: Grams | null;
  readonly totalPesewa: Pesewas | null;
  readonly phone: string;
  readonly locationId: string;
  readonly promisedOn: string | null;
  readonly note: string;
}

export type CorrectionResult =
  | { ok: true; orderId: string; orderNo: string; changes: CorrectionField[]; summary: string; smsQueued: boolean }
  | { ok: false; error: string };

const OPEN: ReadonlySet<string> = new Set(['received', 'washing', 'ready']);

/** Counter and owner repair; collectors take bags, they do not edit them. */
export function canCorrect(role: Session['role']): boolean {
  return role === 'owner' || role === 'counter';
}

function failure(error: string): CorrectionResult {
  return { ok: false, error };
}

function promisedTimestamp(day: string | null): Date | null {
  return day ? new Date(`${day}T12:00:00Z`) : null;
}

function dayOf(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'none';
}

/** "Corrected · 2.9kg, GH¢73 · 2 details". Reads as the counter's receipt. */
function summaryOf(changes: ReadonlyArray<{ field: CorrectionField; to: string }>): string {
  const money = changes.filter((c) => c.field === 'weight' || c.field === 'price').map((c) => c.to);
  const rest = changes.length - money.length;
  const bits = ['Corrected'];
  if (money.length > 0) bits.push(money.join(', '));
  if (rest > 0) bits.push(`${rest} other ${rest === 1 ? 'detail' : 'details'}`);
  return bits.join(' · ');
}

export async function correctOrder(
  db: Db,
  orderId: string,
  input: CorrectionInput,
  session: Session,
): Promise<CorrectionResult> {
  const rows = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.shopId, session.shopId)));
  const order = rows[0];
  if (!order) return failure('Order not found.');
  if (!OPEN.has(order.status)) {
    return failure(`A ${order.status} order keeps its figures. Only an open bag can be corrected.`);
  }

  const phone = normalizePhone(input.phone);
  if (!phone) return failure('Enter a Ghana phone number, like 0241234567.');

  const [currentStudent] = await db.select().from(schema.student).where(eq(schema.student.id, order.studentId));
  if (!currentStudent) return failure('The student on this order is missing.');

  const [currentLocation] = await db.select().from(schema.location).where(eq(schema.location.id, order.locationId));

  const targetLocations = await db
    .select()
    .from(schema.location)
    .where(and(eq(schema.location.id, input.locationId), eq(schema.location.shopId, session.shopId)));
  const location = targetLocations[0];
  if (!location) return failure('Choose where the bag was taken.');

  // The intended record, priced exactly as intake prices it.
  let weightGrams = order.weightGrams as Grams;
  let gross = order.gross as Pesewas;
  if (order.method === 'band') {
    if (input.weightGrams === null) return failure('That order prices by weight, so give the corrected weight.');
    if (input.totalPesewa !== null) return failure('That order prices by weight, so clear the price field.');
    const bandRows = await db.select().from(schema.band).where(eq(schema.band.active, true)).orderBy(asc(schema.band.toGrams));
    const priced = priceAgainstBands(
      bandRows.map((r) => ({ toGrams: r.toGrams, pricePesewa: r.price })),
      input.weightGrams,
    );
    if ('missing' in priced) return failure(priced.missing);
    weightGrams = input.weightGrams;
    gross = priced.price;
  } else {
    if (input.totalPesewa === null) return failure('That order prices by the item, so give the corrected total.');
    if (input.weightGrams !== null) return failure('That order prices by the item, so clear the weight field.');
    if (input.totalPesewa <= 0) return failure('The corrected total must be more than zero.');
    gross = input.totalPesewa;
  }

  const promisedAt = promisedTimestamp(input.promisedOn);
  const sameDay = (a: Date | null, b: Date | null): boolean =>
    a === null || b === null ? a === b : a.getTime() === b.getTime();

  // The diff, in a fixed order, one row per field.
  const changes: Array<{ field: CorrectionField; from: string; to: string }> = [];
  if (weightGrams !== order.weightGrams) {
    changes.push({ field: 'weight', from: weightLabel(order.weightGrams), to: weightLabel(weightGrams) });
  }
  if (gross !== order.gross) {
    changes.push({ field: 'price', from: moneyShort(order.gross), to: moneyShort(gross) });
  }
  if (phone !== currentStudent.phone) {
    changes.push({ field: 'student', from: currentStudent.phone, to: phone });
  }
  if (location.id !== order.locationId) {
    changes.push({ field: 'location', from: currentLocation?.name ?? 'unknown', to: location.name });
  }
  if (!sameDay(promisedAt, order.promisedAt)) {
    changes.push({ field: 'promised_date', from: dayOf(order.promisedAt), to: dayOf(promisedAt) });
  }
  if (changes.length === 0) {
    return failure('Nothing is different on this order. Check the figures before saving.');
  }

  const note = input.note.trim();
  const split = splitTaxInclusive(gross);
  const batchId = crypto.randomUUID();
  const moneyMoved = changes.some((c) => c.field === 'weight' || c.field === 'price');

  try {
    await db.transaction(async (tx) => {
      const student = await upsertStudent(tx, session.shopId, phone, undefined, undefined);

      await tx
        .update(schema.orders)
        .set({
          weightGrams,
          gross,
          base: split.base,
          vat: split.vat,
          nhil: split.nhil,
          getfund: split.getfund,
          studentId: student.id,
          locationId: location.id,
          promisedAt,
        })
        .where(eq(schema.orders.id, orderId));

      // The typo'd student row goes when nothing else points at it.
      if (student.id !== order.studentId) {
        const [leftover] = await tx
          .select({ n: sql<string | number>`count(*)` })
          .from(schema.orders)
          .where(eq(schema.orders.studentId, order.studentId));
        if (Number(leftover?.n ?? 0) === 0) {
          await tx.delete(schema.student).where(eq(schema.student.id, order.studentId));
        }
      }

      for (const change of changes) {
        await tx.insert(schema.orderCorrection).values({
          batchId,
          orderId,
          staffId: session.staffId,
          field: change.field,
          fromValue: change.from,
          toValue: change.to,
          note,
        });
      }

      if (moneyMoved) {
        const [paidRow] = await tx
          .select({ total: sql<string | number>`COALESCE(SUM(amount_pesewa) FILTER (WHERE state <> 'reversed'), 0)` })
          .from(schema.payment)
          .where(eq(schema.payment.orderId, orderId));
        const paid = Number(paidRow?.total ?? 0);
        await enqueueSms(tx, {
          shopId: session.shopId,
          orderId,
          kind: 'corrected',
          toPhone: phone,
          body: correctedMessage(
            order.orderNo,
            order.method === 'band' ? weightLabel(weightGrams) : null,
            gross,
            gross - paid,
          ),
        });
      }
    });
  } catch (err) {
    const law = translateDbError(err);
    if (law) return failure(law.message);
    throw err;
  }

  await attemptSend(db);

  return {
    ok: true,
    orderId,
    orderNo: order.orderNo,
    changes: changes.map((c) => c.field),
    summary: summaryOf(changes),
    smsQueued: moneyMoved,
  };
}

export interface CorrectionRow {
  field: CorrectionField;
  fromValue: string;
  toValue: string;
  staffName: string;
  note: string;
  at: Date;
}

/** The order's corrections, oldest first, for the merged history on the order page. */
export async function listCorrections(db: Db, orderId: string): Promise<CorrectionRow[]> {
  const rows = await db
    .select({ correction: schema.orderCorrection, staffName: schema.staff.name })
    .from(schema.orderCorrection)
    .innerJoin(schema.staff, eq(schema.orderCorrection.staffId, schema.staff.id))
    .where(eq(schema.orderCorrection.orderId, orderId))
    .orderBy(asc(schema.orderCorrection.at));
  return rows.map((r) => ({
    field: r.correction.field,
    fromValue: r.correction.fromValue,
    toValue: r.correction.toValue,
    staffName: r.staffName,
    note: r.correction.note,
    at: r.correction.at,
  }));
}

const FIELD_LABELS: Record<CorrectionField, string> = {
  weight: 'weight',
  price: 'price',
  student: 'student',
  location: 'pickup point',
  promised_date: 'ready date',
};

export function correctionLabel(field: CorrectionField): string {
  return FIELD_LABELS[field];
}
