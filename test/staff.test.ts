import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { hashPin } from '@/lib/auth';
import { loginEligibleStaff, rowCanLogIn } from '@/lib/staff';
import { freshDb, resetDb, type TestDb } from './db';

/**
 * The door rule: only staff with a PIN who are still active may log in.
 * Moving someone to former staff hides them from the login list without
 * touching a single order they ever recorded.
 */

describe('rowCanLogIn', () => {
  it('needs both a PIN and the active flag', () => {
    expect(rowCanLogIn(undefined)).toBe(false);
    expect(rowCanLogIn({ pinHash: null, active: true })).toBe(false);
    expect(rowCanLogIn({ pinHash: hashPin('1234'), active: false })).toBe(false);
    expect(rowCanLogIn({ pinHash: hashPin('1234'), active: true })).toBe(true);
  });
});

describe('loginEligibleStaff', () => {
  let db: TestDb;
  let shopId: string;

  beforeAll(async () => {
    db = await freshDb();
  });

  beforeEach(async () => {
    await resetDb(db);
    const [shop] = await db
      .insert(schema.shop)
      .values({ id: crypto.randomUUID(), name: 'Lawmann Laundry Service', momoNumber: '0556351853' })
      .returning();
    shopId = shop!.id;
  });

  async function addStaff(name: string, active: boolean, withPin: boolean) {
    const [row] = await db
      .insert(schema.staff)
      .values({
        id: crypto.randomUUID(),
        shopId,
        name,
        role: 'counter',
        active,
        pinHash: withPin ? hashPin('1234') : null,
      })
      .returning();
    return row!;
  }

  it('lists working staff with PINs, and nobody else', async () => {
    await addStaff('Working', true, true);
    await addStaff('Former', false, true);
    await addStaff('Pinless', true, false);

    const names = (await loginEligibleStaff(db)).map((s) => s.name);
    expect(names).toEqual(['Working']);
  });

  it('a reactivated staffer reappears without a new PIN', async () => {
    const row = await addStaff('Returned', false, true);
    expect((await loginEligibleStaff(db)).map((s) => s.name)).toEqual([]);

    await db.update(schema.staff).set({ active: true }).where(eq(schema.staff.id, row.id));
    expect((await loginEligibleStaff(db)).map((s) => s.name)).toEqual(['Returned']);
  });
});
