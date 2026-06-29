import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Database } from './client.js';
import {
  agentRuns,
  artifacts,
  jobEvents,
  jobs,
  type AgentRun,
  type Artifact,
  type JobEvent,
  type NewAgentRun,
  type NewArtifact,
  type NewJobEvent,
} from './schema.js';

/**
 * Schema-level contract tests for the historical-data tables added in Plan
 * 01.1-01: `agent_runs`, `job_events`, and `artifacts`. These prove the tables
 * are migrated, round-trip their key fields through Drizzle, and uphold the
 * locked architectural shape (append-only events, generic artifact type).
 */
describe('historical-data schema', () => {
  let dir: string;
  let handle: Database | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'job-finder-schema-'));
    handle = createDb({ path: join(dir, 'test.db') });
  });

  afterEach(() => {
    handle?.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** A job row the FK-bearing tables can reference. */
  function seedJob(): string {
    const id = crypto.randomUUID();
    handle!.db.insert(jobs).values({ id, title: 'Engineer' }).run();
    return id;
  }

  describe('agent_runs', () => {
    it('round-trips a run with status, counters, and a Date startedAt', () => {
      const startedAt = new Date();
      const row: NewAgentRun = {
        agent: 'collector',
        startedAt,
        status: 'STARTED',
        processed: 0,
        succeeded: 0,
        failed: 0,
        durationMs: null,
        tokens: 0,
        estimatedCost: 0,
        error: null,
        metadata: null,
      };
      handle!.db.insert(agentRuns).values(row).run();

      const [got] = handle!.db.select().from(agentRuns).all() as AgentRun[];
      expect(got).toBeDefined();
      expect(got.agent).toBe('collector');
      expect(got.status).toBe('STARTED');
      expect(got.startedAt).toBeInstanceOf(Date);
      expect(got.processed).toBe(0);
      expect(got.tokens).toBe(0);
      expect(got.estimatedCost).toBe(0);
      expect(got.finishedAt).toBeNull();
      expect(got.durationMs).toBeNull();
      expect(got.error).toBeNull();
      expect(got.metadata).toBeNull();
    });

    it('defaults status to STARTED when omitted', () => {
      handle!.db
        .insert(agentRuns)
        .values({ agent: 'scorer', startedAt: new Date() })
        .run();
      const [got] = handle!.db.select().from(agentRuns).all();
      expect(got.status).toBe('STARTED');
    });
  });

  describe('job_events (append-only)', () => {
    it('inserts an event and reconstructs history by jobId', () => {
      const jobId = seedJob();
      const row: NewJobEvent = {
        jobId,
        agent: 'collector',
        event: 'JOB_DISCOVERED',
        payload: null,
      };
      handle!.db.insert(jobEvents).values(row).run();

      const history = handle!.db
        .select()
        .from(jobEvents)
        .where(eq(jobEvents.jobId, jobId))
        .all() as JobEvent[];
      expect(history).toHaveLength(1);
      expect(history[0].event).toBe('JOB_DISCOVERED');
      expect(history[0].createdAt).toBeInstanceOf(Date);
    });

    it('has no updatedAt column (immutable, append-only shape)', () => {
      const cols = handle!.sqlite
        .prepare('PRAGMA table_info(job_events)')
        .all() as Array<{ name: string }>;
      const names = cols.map((c) => c.name);
      expect(names).toContain('created_at');
      expect(names).not.toContain('updated_at');
    });
  });

  describe('artifacts (generic typed table)', () => {
    it('round-trips a known artifact type', () => {
      const jobId = seedJob();
      const row: NewArtifact = {
        jobId,
        type: 'resume_pdf',
        path: '/x.pdf',
        mimeType: 'application/pdf',
        metadata: '{}',
      };
      handle!.db.insert(artifacts).values(row).run();

      const [got] = handle!.db.select().from(artifacts).all() as Artifact[];
      expect(got.type).toBe('resume_pdf');
      expect(got.path).toBe('/x.pdf');
      expect(got.mimeType).toBe('application/pdf');
      expect(got.createdAt).toBeInstanceOf(Date);
    });

    it('accepts a never-before-seen type with no schema change (free-form)', () => {
      const jobId = seedJob();
      expect(() =>
        handle!.db
          .insert(artifacts)
          .values({
            jobId,
            type: 'totally_new_type',
            path: '/y.bin',
          })
          .run(),
      ).not.toThrow();

      const rows = handle!.db
        .select()
        .from(artifacts)
        .where(eq(artifacts.type, 'totally_new_type'))
        .all();
      expect(rows).toHaveLength(1);
    });
  });
});
