/**
 * Wipes shop activity for a fresh start: test bags, payments, students,
 * messages, costs, and shifts. Setup is never touched — the shop, tariff
 * bands, locations, staff logins, and applied migrations all stay.
 *
 * Usage: RESET_CONFIRM=yes [DATABASE_URL=postgres://...] npm run db:reset-activity
 * Without DATABASE_URL it targets local PGlite; with it, that database.
 * There is no undo. The script prints its target and refuses without consent.
 */

import { client, ensureBooted } from '@/lib/db';

const ACTIVITY_TABLES = ['shift', 'operating_cost', 'sms_message', 'order_event', 'payment', 'orders', 'student'] as const;

async function main(): Promise<void> {
  if (process.env.RESET_CONFIRM !== 'yes') {
    throw new Error('reset-activity: refusing without RESET_CONFIRM=yes. There is no undo.');
  }
  await ensureBooted();
  const target = process.env.DATABASE_URL ? 'DATABASE_URL' : 'local PGlite (.pglite/)';
  console.log(`reset-activity: wiping activity on ${target}`);

  const before: Record<string, number> = {};
  for (const table of ACTIVITY_TABLES) {
    const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`);
    before[table] = Number(rows[0]?.n ?? 0);
  }

  await client.exec(`TRUNCATE ${ACTIVITY_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);

  console.log('reset-activity: deleted:');
  for (const table of ACTIVITY_TABLES) {
    console.log(`  ${table}: ${before[table]}`);
  }
  console.log('Kept: shop, locations, tariff bands, staff, applied migrations.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
