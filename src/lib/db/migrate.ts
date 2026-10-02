import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXPECTED_COLUMNS } from './schema';

/**
 * The boot sequence every process runs before its first query: generated
 * migrations, then the hand-written triggers, then the assertion that the
 * live database has the columns schema.ts expects. A database that disagrees
 * with the schema fails loudly at boot, not silently at the counter.
 *
 * Migrations are applied by this file, not by drizzle's migrator: its PGlite
 * path silently applied nothing at the versions in package.json. The runner
 * reads the same journal drizzle-kit writes, applies each file with
 * client.exec (one transaction per statement batch), and records what ran in
 * lawmann_migrations so reboots are idempotent.
 *
 * The client is a structural interface so the same sequence runs over
 * PGlite (dev, .pglite/) and node-postgres (production, DATABASE_URL): both
 * expose exec for multi-statement batches and query for parameterized rows.
 */

export interface SqlClient {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const DRIZZLE_DIR = join(process.cwd(), 'drizzle');
const TRIGGERS_PATH = join(process.cwd(), 'src', 'lib', 'db', 'triggers.sql');

interface Journal {
  entries: Array<{ idx: number; tag: string; when: number }>;
}

export async function applyMigrations(client: SqlClient): Promise<void> {
  await client.exec(
    'CREATE TABLE IF NOT EXISTS lawmann_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const { rows: applied } = await client.query<{ name: string }>('SELECT name FROM lawmann_migrations');
  const done = new Set(applied.map((r) => r.name));

  const journal: Journal = JSON.parse(await readFile(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8'));
  for (const entry of journal.entries) {
    if (done.has(entry.tag)) continue;
    const sql = await readFile(join(DRIZZLE_DIR, `${entry.tag}.sql`), 'utf8');
    await client.exec('BEGIN');
    try {
      await client.exec(sql);
      await client.exec('COMMIT');
    } catch (err) {
      await client.exec('ROLLBACK');
      throw err;
    }
    // ON CONFLICT DO NOTHING: two serverless cold starts can boot at once
    // against a fresh database; the loser of the race must still come up.
    await client.query(
      'INSERT INTO lawmann_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [entry.tag],
    );
  }
}

export async function applyTriggers(client: SqlClient): Promise<void> {
  const sql = await readFile(TRIGGERS_PATH, 'utf8');
  await client.exec(sql);
}

export async function assertSchema(client: SqlClient): Promise<void> {
  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [table],
    );
    const present = new Set(rows.map((r) => r.column_name));
    const missing = columns.filter((c) => !present.has(c));
    if (missing.length > 0) {
      throw new Error(
        `Database is out of sync with schema.ts: ${table} is missing ${missing.join(', ')}. ` +
          `Run migrations (src/lib/db/migrate.ts) before serving requests.`,
      );
    }
  }
}

export async function runBoot(client: SqlClient): Promise<void> {
  await applyMigrations(client);
  await applyTriggers(client);
  await assertSchema(client);
}
