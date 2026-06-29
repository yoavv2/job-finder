import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Database } from '../client.js';
import { CompanyRepository } from './company-repository.js';

describe('CompanyRepository', () => {
  let dir: string;
  let handle: Database;
  let repo: CompanyRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'job-finder-companyrepo-'));
    handle = createDb({ path: join(dir, 'test.db') });
    repo = new CompanyRepository(handle.db);
  });

  afterEach(() => {
    handle.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('upsert', () => {
    it('sets firstSeenAt and lastSeenAt on a new company', () => {
      const c = repo.upsert({ name: 'Acme', ats: 'greenhouse', boardToken: 'acme' });
      expect(c.firstSeenAt).toBeInstanceOf(Date);
      expect(c.lastSeenAt).toBeInstanceOf(Date);
      expect(c.name).toBe('Acme');
    });

    it('is idempotent on identity (ats+boardToken): updates lastSeenAt, keeps firstSeenAt and id', () => {
      const first = repo.upsert({ name: 'Acme', ats: 'greenhouse', boardToken: 'acme' });
      const firstSeen = first.firstSeenAt!.getTime();

      // Force a later clock so lastSeenAt is observably newer.
      const second = repo.upsert(
        { name: 'Acme Renamed', ats: 'greenhouse', boardToken: 'acme' },
        new Date(firstSeen + 1000),
      );

      expect(second.id).toBe(first.id);
      expect(second.firstSeenAt!.getTime()).toBe(firstSeen);
      expect(second.lastSeenAt!.getTime()).toBeGreaterThan(firstSeen);

      // No duplicate row created.
      const all = repo.findActive();
      expect(all).toHaveLength(1);
    });

    it('uses name as identity when ats/boardToken are absent', () => {
      const first = repo.upsert({ name: 'Solo Inc' });
      const second = repo.upsert({ name: 'Solo Inc' });
      expect(second.id).toBe(first.id);
    });
  });

  describe('findActive', () => {
    it('returns only active companies', () => {
      repo.upsert({ name: 'Active Co', ats: 'lever', boardToken: 'a' });
      repo.upsert({ name: 'Inactive Co', ats: 'lever', boardToken: 'b', active: false });

      const active = repo.findActive();
      expect(active).toHaveLength(1);
      expect(active[0]!.name).toBe('Active Co');
    });
  });

  describe('touchLastSeen', () => {
    it('updates lastSeenAt for a company', () => {
      const c = repo.upsert({ name: 'Acme', ats: 'greenhouse', boardToken: 'acme' });
      const later = new Date(c.lastSeenAt!.getTime() + 5000);
      repo.touchLastSeen(c.id, later);

      const active = repo.findActive();
      expect(active[0]!.lastSeenAt!.getTime()).toBe(later.getTime());
    });
  });
});
