import { and, asc, eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import { translateDbError } from '@/lib/errors';
import type { Session } from '@/lib/auth';
import type { ConditionPhotoInputForm } from '@/lib/validation';

/**
 * The evidence. A student hands over a bag with a stain already in it and
 * later says the shop put it there. The collector photographs the item at
 * the moment the bag is taken, with one line saying what is wrong, and the
 * shop has an answer.
 *
 * Three rules hold. The photograph belongs to an open bag, because the whole
 * point is the state of the item before the shop touched it. The note rides
 * with it, because an unlabelled photograph proves nothing. And it is written
 * once: it is a record, not a gallery, and it never reaches the student.
 */

/**
 * The base64 ceiling. A 1000px JPEG at quality 0.7 lands near 300KB, which
 * base64 inflates by a third; the cap sits well above that and well below the
 * 2MB server-action limit, so an honest photograph is never refused.
 */
export const MAX_PHOTO_CHARS = 1_400_000;

const OPEN: ReadonlySet<string> = new Set(['received', 'washing', 'ready']);

/** Every role may photograph: the collector at the hostel is the intended user. */
export function canPhotograph(role: Session['role']): boolean {
  return role === 'owner' || role === 'counter' || role === 'collector';
}

export type ConditionResult = { ok: true; photoId: string } | { ok: false; error: string };

function failure(error: string): ConditionResult {
  return { ok: false, error };
}

export async function addConditionPhoto(
  db: Db,
  orderId: string,
  input: ConditionPhotoInputForm,
  session: Session,
): Promise<ConditionResult> {
  const orders = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.shopId, session.shopId)));
  const order = orders[0];
  if (!order) return failure('Order not found.');
  if (!OPEN.has(order.status)) {
    return failure('That bag has already left. Only an open bag is photographed.');
  }
  if (input.image.length > MAX_PHOTO_CHARS) {
    return failure('That photograph is too large. Take a closer shot.');
  }

  try {
    const inserted = await db
      .insert(schema.conditionPhoto)
      .values({ orderId, staffId: session.staffId, note: input.note, image: input.image })
      .returning({ id: schema.conditionPhoto.id });
    const photoId = inserted[0]?.id;
    if (!photoId) throw new Error('condition_photo insert returned no row');
    return { ok: true, photoId };
  } catch (err) {
    const law = translateDbError(err);
    if (law) return failure(law.message);
    throw err;
  }
}

export interface ConditionPhoto {
  id: string;
  note: string;
  image: string;
  staffName: string;
  createdAt: Date;
}

/** The order's photographs, oldest first, for the Condition section. */
export async function listConditionPhotos(db: Db, orderId: string): Promise<ConditionPhoto[]> {
  const rows = await db
    .select({ photo: schema.conditionPhoto, staffName: schema.staff.name })
    .from(schema.conditionPhoto)
    .innerJoin(schema.staff, eq(schema.conditionPhoto.staffId, schema.staff.id))
    .where(eq(schema.conditionPhoto.orderId, orderId))
    .orderBy(asc(schema.conditionPhoto.createdAt));
  return rows.map((r) => ({
    id: r.photo.id,
    note: r.photo.note,
    image: r.photo.image,
    staffName: r.staffName,
    createdAt: r.photo.createdAt,
  }));
}
