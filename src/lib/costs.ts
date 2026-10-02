import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { operatingCost } from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import type { CostInput } from '@/lib/validation';
import type { Session } from '@/lib/auth';

export type CostRow = typeof operatingCost.$inferSelect;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function addCost(
  db: Db,
  input: CostInput,
  session: Session,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const rows = await db
      .insert(operatingCost)
      .values({
        shopId: session.shopId,
        category: input.category,
        label: input.label || null,
        amount: input.amount,
        incurredOn: input.incurredOn,
      })
      .returning({ id: operatingCost.id });
    const id = rows[0]?.id;
    if (!id) return { ok: false, error: 'Could not record the cost.' };
    return { ok: true, id };
  } catch {
    return { ok: false, error: 'Could not record the cost.' };
  }
}

export async function listCosts(db: Db, shopId: string, from?: Date, to?: Date): Promise<CostRow[]> {
  const conds = [eq(operatingCost.shopId, shopId)];
  if (from) conds.push(gte(operatingCost.incurredOn, isoDate(from)));
  if (to) conds.push(lte(operatingCost.incurredOn, isoDate(to)));
  return db.select().from(operatingCost).where(and(...conds)).orderBy(desc(operatingCost.incurredOn));
}
