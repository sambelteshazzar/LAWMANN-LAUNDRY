import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleOverPglite } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { runBoot } from './migrate';

/**
 * One client per process, file-backed at .pglite/ so dev data survives
 * restarts. PGlite is real Postgres, so the triggers and constraints in
 * triggers.sql run as written. Production swaps this file for the node
 * driver over DATABASE_URL (infra/docker-compose.yml); everything above
 * this line is unchanged when that day comes.
 *
 * The boot (migrations, triggers, schema assertion) runs once per process
 * and is kept on globalThis so Next.js dev-module-reloads do not re-run it
 * or, worse, open a second PGlite handle to the same files.
 */

const DATA_DIR = join(process.cwd(), '.pglite');

export type Db = ReturnType<typeof drizzleOverPglite<typeof schema>>;

interface DbGlobal {
  __lawmannDb?: Db;
  __lawmannBooted?: boolean;
  __lawmannBootPromise?: Promise<void>;
}

const g = globalThis as typeof globalThis & DbGlobal;

if (process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is set, but this build runs on embedded Postgres (PGlite). ' +
      'Remove DATABASE_URL to run on .pglite/, or wire the production driver in src/lib/db/index.ts.',
  );
}

export const client = new PGlite(DATA_DIR);

export const db: Db = g.__lawmannDb ?? drizzleOverPglite(client, { schema });
g.__lawmannDb = db;

export function getDb(): Db {
  return db;
}

export async function ensureBooted(): Promise<void> {
  if (g.__lawmannBooted) return;
  g.__lawmannBootPromise ??= runBoot(client).then(() => {
    g.__lawmannBooted = true;
  });
  await g.__lawmannBootPromise;
}
