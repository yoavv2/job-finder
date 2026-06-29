import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Config } from '../config/load.js';
import * as schema from './schema.js';

/** Migrations live next to this module, so resolve relative to the file. */
const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Default busy_timeout (ms) applied when the caller does not specify one. */
const DEFAULT_BUSY_TIMEOUT_MS = 5000;

/**
 * A live database handle. Plan 04's repositories use `db` (the typed Drizzle
 * instance) for normal access and the raw `sqlite` handle for the atomic
 * `BEGIN IMMEDIATE` claim that Drizzle's builder does not expose directly.
 */
export interface Database {
  /** The typed Drizzle ORM instance (schema-aware). */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** The raw better-sqlite3 connection (pragmas, BEGIN IMMEDIATE, etc.). */
  sqlite: BetterSqlite3.Database;
}

/**
 * Open a SQLite database, configure it for safe concurrent access, and apply
 * pending migrations so the schema is ready to use.
 *
 * Concurrency hardening (Pitfall #9): every connection opens with
 * `PRAGMA journal_mode=WAL` and a `PRAGMA busy_timeout`, so a busy writer makes
 * readers/other writers wait instead of failing with SQLITE_BUSY.
 *
 * @param opts.path          File path for the database (a temp file in tests).
 * @param opts.busyTimeoutMs Lock-wait timeout in ms (default 5000).
 */
export function createDb(opts: {
  path: string;
  busyTimeoutMs?: number;
}): Database {
  const sqlite = new BetterSqlite3(opts.path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma(`busy_timeout = ${opts.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS}`);

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return { db, sqlite };
}

/**
 * Convenience wrapper that opens the database from validated app config,
 * mapping `config.database.path` to {@link createDb}.
 */
export function createDbFromConfig(config: Config): Database {
  return createDb({ path: config.database.path });
}
