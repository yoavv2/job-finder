import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Database } from '../client.js';
import { JobRepository } from './job-repository.js';

/**
 * Concurrency / overlap proof for the atomic claim.
 *
 * better-sqlite3 is synchronous and single-writer, so we simulate overlapping
 * scheduled runs by issuing claim batches back-to-back against the SAME db. The
 * guarantee under test is structural, not timing-dependent: each claim is a
 * `BEGIN IMMEDIATE` `UPDATE ... WHERE status = 'NEW' ... RETURNING *` that moves
 * rows OUT of 'NEW' atomically. A second (overlapping) claim therefore cannot
 * re-select any row the first batch already moved — proving no job is ever
 * double-processed across overlapping/back-to-back claim passes.
 */
describe('atomic claim — overlap / double-processing safety', () => {
  const N = 20;
  let dir: string;
  let handle: Database;
  let repo: JobRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'job-finder-claim-'));
    handle = createDb({ path: join(dir, 'test.db') });
    repo = new JobRepository(handle.db, handle.sqlite);
    for (let i = 0; i < N; i++) {
      repo.insertNew({ title: `J${i}`, source: 's', externalId: `${i}` });
    }
  });

  afterEach(() => {
    handle.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('never claims the same job twice across overlapping passes', () => {
    // Two passes whose limits together exceed N, simulating overlapping runs.
    const batchA = repo.claimByStatus('NEW', 'SCORING', 'worker-A', 15);
    const batchB = repo.claimByStatus('NEW', 'SCORING', 'worker-B', 15);

    const idsA = batchA.map((j) => j.id);
    const idsB = batchB.map((j) => j.id);

    // No id appears in both batches — no double-claim.
    const overlap = idsA.filter((id) => idsB.includes(id));
    expect(overlap).toEqual([]);

    // Total claimed never exceeds the number of available jobs.
    const total = idsA.length + idsB.length;
    expect(total).toBe(N);

    // The union of claimed ids has no duplicates.
    const union = new Set([...idsA, ...idsB]);
    expect(union.size).toBe(N);
  });

  it('drains NEW exactly once: nothing left in NEW, each job SCORING once', () => {
    repo.claimByStatus('NEW', 'SCORING', 'worker-A', 15);
    repo.claimByStatus('NEW', 'SCORING', 'worker-B', 15);

    expect(repo.findByStatus('NEW')).toHaveLength(0);

    const scoring = repo.findByStatus('SCORING');
    expect(scoring).toHaveLength(N);
    // Every job is in SCORING exactly once (ids are unique).
    expect(new Set(scoring.map((j) => j.id)).size).toBe(N);
  });

  it('is an idempotent no-op once NEW is drained (third claim returns [])', () => {
    repo.claimByStatus('NEW', 'SCORING', 'worker-A', 15);
    repo.claimByStatus('NEW', 'SCORING', 'worker-B', 15);

    const third = repo.claimByStatus('NEW', 'SCORING', 'worker-C', 15);
    expect(third).toEqual([]);
  });
});
