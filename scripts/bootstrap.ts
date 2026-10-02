/**
 * Bootstraps a fresh production database with the real business and nothing
 * else: one shop, the real campus locations, the real tariff bands, and one
 * owner with a PIN. No students, no orders, no fake history — that is the
 * demo seed's job, and it refuses to run against DATABASE_URL.
 *
 * Usage: DATABASE_URL=postgres://... npm run db:bootstrap
 * Options: BOOTSTRAP_OWNER_NAME (default "Owner"), BOOTSTRAP_PIN (default:
 * a random 6-digit PIN printed once to the console).
 */

import { getDb, ensureBooted } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { BANDS } from '@/lib/pricing';
import { hashPin } from '@/lib/auth';
import { LOCATIONS } from '@/lib/locations';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('bootstrap: DATABASE_URL is required. This script is for production databases.');
  }
  await ensureBooted();
  const db = getDb();

  const existing = await db.select({ id: schema.shop.id }).from(schema.shop).limit(1);
  if (existing.length > 0) {
    throw new Error(
      'bootstrap: a shop already exists. Bootstrap only runs once; add staff and set PINs ' +
        'inside the app (Staff page) instead of bootstrapping again.',
    );
  }

  const [shop] = await db
    .insert(schema.shop)
    .values({ name: 'Lawmann Laundry Service', momoNumber: '0556351853' })
    .returning();
  if (!shop) throw new Error('bootstrap: shop insert failed');

  for (const [name, kind] of LOCATIONS) {
    const [row] = await db.insert(schema.location).values({ shopId: shop.id, name, kind }).returning();
    if (!row) throw new Error(`bootstrap: location ${name} failed`);
  }

  await db.insert(schema.band).values(BANDS.map((b) => ({ toGrams: b.to, price: b.price, active: true })));

  const ownerName = process.env.BOOTSTRAP_OWNER_NAME ?? 'Owner';
  const pin = process.env.BOOTSTRAP_PIN ?? String(100000 + Math.floor(Math.random() * 900000));
  const [owner] = await db
    .insert(schema.staff)
    .values({ shopId: shop.id, name: ownerName, role: 'owner', pinHash: hashPin(pin) })
    .returning();
  if (!owner) throw new Error('bootstrap: owner insert failed');

  console.log(
    `Bootstrapped: 1 shop, ${LOCATIONS.length} locations, ${BANDS.length} tariff bands, 1 owner.`,
  );
  console.log(`Owner "${ownerName}" — PIN: ${pin}`);
  console.log('Log in once, then add the counter and collector staff from the Staff page.');
  console.log('If the PIN was random, change it from the Staff page after the first login.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
