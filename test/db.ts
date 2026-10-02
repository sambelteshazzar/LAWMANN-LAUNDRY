import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleOverPglite } from 'drizzle-orm/pglite';
import * as schema from '@/lib/db/schema';
import { runBoot } from '@/lib/db/migrate';
import { splitTaxInclusive } from '@/lib/tax';

/**
 * Integration tests get a throwaway real Postgres: in-memory PGlite with the
 * generated migrations and the hand-written triggers applied, exactly like
 * production boot. Nothing is mocked, because the point is to prove the
 * database enforces its own laws.
 */

export type TestDb = ReturnType<typeof drizzleOverPglite<typeof schema>>;

export interface ShopFixture {
  db: TestDb;
  client: PGlite;
  shopId: string;
  locationId: string;
  staffId: string;
  studentId: string;
}

export async function freshDb(): Promise<TestDb> {
  const client = new PGlite();
  await runBoot(client);
  return drizzleOverPglite(client, { schema });
}

/**
 * Wipes every business table between tests. Booting a PGlite per test costs
 * seconds; truncating costs milliseconds. lawmann_migrations is untouched —
 * the schema stays applied, only the data goes.
 */
export async function resetDb(db: TestDb): Promise<void> {
  await db.$client.exec(
    'TRUNCATE shift, operating_cost, sms_message, order_event, payment, orders, student, staff, location, shop, band RESTART IDENTITY CASCADE',
  );
}

/** One shop, one campus location, one staff member, one student — the minimum a legal order needs. */
export async function seededShop(db: TestDb, client: PGlite): Promise<ShopFixture> {
  const shops = await db
    .insert(schema.shop)
    .values({ id: crypto.randomUUID(), name: 'Lawmann Laundry Service', momoNumber: '0556351853' })
    .returning();
  const locations = await db
    .insert(schema.location)
    .values({ id: crypto.randomUUID(), shopId: shops[0]!.id, name: 'TF Hostel', kind: 'campus' })
    .returning();
  const staffRows = await db
    .insert(schema.staff)
    .values({ id: crypto.randomUUID(), shopId: shops[0]!.id, name: 'Owner', role: 'owner' })
    .returning();
  const students = await db
    .insert(schema.student)
    .values({ id: crypto.randomUUID(), shopId: shops[0]!.id, phone: '0241234567', name: 'Ama' })
    .returning();
  return {
    db,
    client,
    shopId: shops[0]!.id,
    locationId: locations[0]!.id,
    staffId: staffRows[0]!.id,
    studentId: students[0]!.id,
  };
}

export interface OrderFixtureInput {
  grossPesewa?: number;
  weightGrams?: number;
  recordedBy?: string;
  id?: string;
  createdAt?: Date;
}

/** An order whose stored tax split foots, so tests can break exactly one law at a time. */
export async function legalOrder(fx: ShopFixture, input: OrderFixtureInput = {}) {
  const gross = input.grossPesewa ?? 9300;
  const split = splitTaxInclusive(gross);
  const inserted = await fx.db
    .insert(schema.orders)
    .values({
      id: input.id ?? crypto.randomUUID(),
      shopId: fx.shopId,
      orderNo: input.id ?? crypto.randomUUID(),
      locationId: fx.locationId,
      studentId: fx.studentId,
      recordedBy: input.recordedBy ?? fx.staffId,
      weightGrams: input.weightGrams ?? 3500,
      method: 'band',
      gross,
      base: split.base,
      vat: split.vat,
      nhil: split.nhil,
      getfund: split.getfund,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .returning();
  const order = inserted[0];
  if (!order) throw new Error('legalOrder fixture failed to insert');
  return order;
}
