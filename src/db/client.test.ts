import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Database } from './client.js';

describe('createDb', () => {
  let dir: string;
  let dbPath: string;
  let handle: Database | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'job-finder-db-'));
    dbPath = join(dir, 'test.db');
    handle = undefined;
  });

  afterEach(() => {
    handle?.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the database file on open', () => {
    handle = createDb({ path: dbPath });
    expect(existsSync(dbPath)).toBe(true);
  });

  it('opens in WAL journal mode', () => {
    handle = createDb({ path: dbPath });
    const mode = handle.sqlite.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });

  it('sets a non-zero busy_timeout', () => {
    handle = createDb({ path: dbPath, busyTimeoutMs: 7000 });
    const timeout = handle.sqlite.pragma('busy_timeout', { simple: true });
    expect(timeout).toBe(7000);
  });

  it('defaults busy_timeout to a positive value when unspecified', () => {
    handle = createDb({ path: dbPath });
    const timeout = handle.sqlite.pragma('busy_timeout', {
      simple: true,
    }) as number;
    expect(timeout).toBeGreaterThan(0);
  });

  it('applies migrations so all three tables are selectable', () => {
    handle = createDb({ path: dbPath });
    // Each query throws if the table does not exist; reaching the assertions
    // means the migration created the tables.
    expect(() =>
      handle!.sqlite.prepare('SELECT * FROM companies').all(),
    ).not.toThrow();
    expect(() =>
      handle!.sqlite.prepare('SELECT * FROM jobs').all(),
    ).not.toThrow();
    expect(() =>
      handle!.sqlite.prepare('SELECT * FROM applications').all(),
    ).not.toThrow();
  });

  it('enforces the unique (source, external_id) dedup index on jobs', () => {
    handle = createDb({ path: dbPath });
    const insert = handle.sqlite.prepare(
      "INSERT INTO jobs (id, source, external_id, title) VALUES (?, 'greenhouse', 'gh-1', 'Engineer')",
    );
    insert.run('a');
    expect(() => insert.run('b')).toThrowError(/UNIQUE/i);
  });

  it('exposes a usable drizzle instance', () => {
    handle = createDb({ path: dbPath });
    expect(handle.db).toBeDefined();
    // The drizzle query builder is present.
    expect(typeof handle.db.select).toBe('function');
  });
});
