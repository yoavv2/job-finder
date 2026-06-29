import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Database } from '../client.js';
import { JobRepository } from './job-repository.js';

/**
 * JobRepository tests run against a real on-disk SQLite DB (real WAL +
 * busy_timeout from Plan 02) so the atomic BEGIN IMMEDIATE claim is exercised
 * against actual SQLite locking semantics, not a mock.
 */
describe('JobRepository', () => {
  let dir: string;
  let handle: Database;
  let repo: JobRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'job-finder-jobrepo-'));
    handle = createDb({ path: join(dir, 'test.db') });
    repo = new JobRepository(handle.db, handle.sqlite);
  });

  afterEach(() => {
    handle.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('insertNew', () => {
    it('creates a job with status NEW', () => {
      const job = repo.insertNew({
        title: 'Engineer',
        source: 'greenhouse',
        externalId: 'gh-1',
      });
      expect(job.status).toBe('NEW');
      expect(job.title).toBe('Engineer');
      expect(job.id).toBeTruthy();
    });

    it('is idempotent on the (source, externalId) unique index (no duplicate)', () => {
      const first = repo.insertNew({
        title: 'Engineer',
        source: 'greenhouse',
        externalId: 'gh-1',
      });
      const second = repo.insertNew({
        title: 'Engineer (re-scraped)',
        source: 'greenhouse',
        externalId: 'gh-1',
      });
      // Same identity -> returns the existing row, no second row created.
      expect(second.id).toBe(first.id);
      expect(repo.findByStatus('NEW')).toHaveLength(1);
    });
  });

  describe('findByStatus', () => {
    it('returns only jobs in the requested status', () => {
      repo.insertNew({ title: 'A', source: 's', externalId: '1' });
      repo.insertNew({ title: 'B', source: 's', externalId: '2' });
      const claimed = repo.claimByStatus('NEW', 'SCORING', 'worker', 1);

      expect(repo.findByStatus('NEW')).toHaveLength(1);
      expect(repo.findByStatus('SCORING')).toHaveLength(1);
      expect(repo.findByStatus('SCORING')[0]!.id).toBe(claimed[0]!.id);
    });
  });

  describe('getById', () => {
    it('returns a job by id and undefined for unknown ids', () => {
      const job = repo.insertNew({ title: 'A', source: 's', externalId: '1' });
      expect(repo.getById(job.id)?.id).toBe(job.id);
      expect(repo.getById('does-not-exist')).toBeUndefined();
    });
  });

  describe('claimByStatus', () => {
    it('atomically transitions up to `limit` rows and stamps claimedBy/claimedAt', () => {
      for (let i = 0; i < 5; i++) {
        repo.insertNew({ title: `J${i}`, source: 's', externalId: `${i}` });
      }
      const claimed = repo.claimByStatus('NEW', 'SCORING', 'worker-1', 3);

      expect(claimed).toHaveLength(3);
      for (const job of claimed) {
        expect(job.status).toBe('SCORING');
        expect(job.claimedBy).toBe('worker-1');
        expect(job.claimedAt).toBeInstanceOf(Date);
      }
      expect(repo.findByStatus('NEW')).toHaveLength(2);
    });

    it('returns an empty array when no rows match the `from` status', () => {
      expect(repo.claimByStatus('NEW', 'SCORING', 'worker', 10)).toEqual([]);
    });

    it('rejects an illegal claim transition via the state machine', () => {
      expect(() =>
        repo.claimByStatus('NEW', 'TAILORED', 'worker', 1),
      ).toThrowError(/illegal status transition/i);
    });
  });

  describe('transition', () => {
    it('updates status on a legal transition', () => {
      const job = repo.insertNew({ title: 'A', source: 's', externalId: '1' });
      repo.transition(job.id, 'SCORING');
      repo.transition(job.id, 'SCORED', { score: 88 });

      const updated = repo.getById(job.id)!;
      expect(updated.status).toBe('SCORED');
      expect(updated.score).toBe(88);
      expect(updated.scoredAt).toBeInstanceOf(Date);
    });

    it('throws on an illegal transition (NEW -> TAILORED)', () => {
      const job = repo.insertNew({ title: 'A', source: 's', externalId: '1' });
      expect(() => repo.transition(job.id, 'TAILORED')).toThrowError(
        /illegal status transition/i,
      );
    });

    it('records lastError when transitioning to ERROR', () => {
      const job = repo.insertNew({ title: 'A', source: 's', externalId: '1' });
      repo.transition(job.id, 'ERROR', { lastError: 'boom' });

      const updated = repo.getById(job.id)!;
      expect(updated.status).toBe('ERROR');
      expect(updated.lastError).toBe('boom');
    });

    it('throws when transitioning an unknown job id', () => {
      expect(() => repo.transition('nope', 'SCORING')).toThrowError(/not found/i);
    });
  });
});
