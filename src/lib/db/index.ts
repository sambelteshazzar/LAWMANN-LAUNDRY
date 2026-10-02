import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { drizzle as drizzleOverPglite } from 'drizzle-orm/pglite';
import { drizzle as drizzleOverNodePg } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { runBoot, type SqlClient } from './migrate';

/**
 * One client per process, chosen by environment: with DATABASE_URL the app
 * talks node-postgres to a real server (Neon, the compose file in infra/);
 * without it, dev and tests run on PGlite, file-backed at .pglite/ so local
 * data survives restarts. PGlite is real Postgres, so the triggers and
 * constraints in triggers.sql run as written on both paths.
 *
 * The boot (migrations, triggers, schema assertion) runs once per process
 * and is kept on globalThis so Next.js dev-module-reloads do not re-run it
 * or, worse, open a second handle to the same data. In production the boot
 * runs on a dedicated pg client (one connection, so the BEGIN/COMMIT pairs
 * in the migration runner hold), then hands serving back to the pool.
 *
 * Db keeps the PGlite-derived type (test/db.ts mirrors it): drizzle types
 * the two drivers by their query-result HKTs, which differ, even though the
 * query-builder API the app uses is identical. The production branch is
 * cast once, here, and nowhere else.
 */

export type Db = ReturnType<typeof drizzleOverPglite<typeof schema>>;

interface DbGlobal {
  __lawmannPglite?: PGlite;
  __lawmannPool?: pg.Pool;
  __lawmannDb?: Db;
  __lawmannBooted?: boolean;
  __lawmannBootPromise?: Promise<void>;
}

const g = globalThis as typeof globalThis & DbGlobal;

const DATABASE_URL = process.env.DATABASE_URL;

// The node-postgres adapter: exec is the simple query protocol, which runs
// multi-statement batches the way PGlite's exec does.
function overNodePg(client: pg.Client | pg.Pool): SqlClient {
  return {
    async exec(sql) {
      await client.query(sql);
    },
    async query<T>(sql: string, params?: unknown[]) {
      const result = await client.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
}

export const client: SqlClient = DATABASE_URL
  ? overNodePg((g.__lawmannPool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 3 })))
  : (g.__lawmannPglite ??= new PGlite(join(process.cwd(), '.pglite')));

export const db: Db = (g.__lawmannDb ??= DATABASE_URL
  ? (drizzleOverNodePg(g.__lawmannPool!, { schema }) as unknown as Db)
  : drizzleOverPglite(g.__lawmannPglite!, { schema }));

export function getDb(): Db {
  return db;
}

export async function ensureBooted(): Promise<void> {
  if (g.__lawmannBooted) return;
  g.__lawmannBootPromise ??= (async () => {
    if (DATABASE_URL) {
      const bootClient = new pg.Client({ connectionString: DATABASE_URL });
      await bootClient.connect();
      try {
        await runBoot(overNodePg(bootClient));
      } finally {
        await bootClient.end();
      }
    } else {
      await runBoot(client);
    }
    g.__lawmannBooted = true;
  })();
  await g.__lawmannBootPromise;
}
