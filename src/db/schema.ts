import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { JobStatus } from './status.js';

/**
 * Drizzle (schema-as-TypeScript) definitions for the three persistence tables.
 * This file is the typed source of truth for the DB shape; the connection layer
 * (`./client.ts`) and repositories (Plan 04) consume the inferred types below.
 *
 * Conventions:
 * - Primary keys are text UUIDs defaulted with SQLite's `randomblob`-free
 *   approach via app-side `crypto.randomUUID()`; here we provide a SQL default
 *   so inserts that omit `id` still get a stable value.
 * - Timestamps are stored as integer epoch-millis (`{ mode: 'timestamp_ms' }`)
 *   so Drizzle hands JS `Date` objects back and forth.
 * - Booleans are stored as integers via `{ mode: 'boolean' }`.
 */

/**
 * Companies — the **emergent knowledge base** (COMP-01). Records are seeded as a
 * bootstrap in v1 and (in v2) populated by Company Discovery. Job Discovery is
 * agnostic to how a company arrived; it reads `ats` + `boardToken` to dispatch.
 */
export const companies = sqliteTable('companies', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** Human-readable company name. */
  name: text('name').notNull(),
  /** ATS provider slug (e.g. 'greenhouse', 'lever') — drives the collector. */
  ats: text('ats'),
  /** Board token / org slug used by the ATS API. */
  boardToken: text('board_token'),
  /** Canonical careers page URL. */
  careersUrl: text('careers_url'),
  /** Company website. */
  website: text('website'),
  /** When this company first entered the KB. */
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }),
  /** When this company was last confirmed/seen. */
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  /** Whether the company is actively scanned. */
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

/**
 * Jobs — the unit of work the pipeline coordinates through. `status` is typed to
 * the `JobStatus` state machine; `claimedBy`/`claimedAt` support the atomic
 * `BEGIN IMMEDIATE` claim implemented in Plan 04. The unique (source, externalId)
 * index gives each job a stable cross-run identity for dedup (Pitfall #4).
 */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** FK -> companies.id. */
    companyId: text('company_id').references(() => companies.id),
    /** The ATS-native id for this posting (stable per source). */
    externalId: text('external_id'),
    /** The source/ATS this job came from (e.g. 'greenhouse'). */
    source: text('source'),
    title: text('title').notNull(),
    location: text('location'),
    url: text('url'),
    description: text('description'),
    postedDate: integer('posted_date', { mode: 'timestamp_ms' }),
    /** Lifecycle state — see ./status.ts. Defaults to 'NEW'. */
    status: text('status').$type<JobStatus>().notNull().default('NEW'),
    /** Match score (0-100), null until scored. */
    score: integer('score'),
    /** Worker/agent id holding the atomic claim, null when unclaimed. */
    claimedBy: text('claimed_by'),
    claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
    /** Last error message when status is ERROR. */
    lastError: text('last_error'),
    discoveredAt: integer('discovered_at', { mode: 'timestamp_ms' }),
    scoredAt: integer('scored_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // Stable identity per source for cross-run dedup (Pitfall #4).
    uniqueIndex('jobs_source_external_id_unq').on(
      table.source,
      table.externalId,
    ),
    // Status is the message-bus column — index it for queue scans.
    index('jobs_status_idx').on(table.status),
  ],
);

/**
 * Applications — produced when a job reaches the tailoring stage. Carries the
 * generated resume path and a snapshot of the score at application time.
 */
export const applications = sqliteTable('applications', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** FK -> jobs.id. */
  jobId: text('job_id')
    .notNull()
    .references(() => jobs.id),
  status: text('status'),
  /** Path to the generated, job-tailored resume artifact. */
  resumePath: text('resume_path'),
  /** Match score captured at application time. */
  scoreSnapshot: integer('score_snapshot'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * ─── Historical-data tables ──────────────────────────────────────────────
 *
 * The three tables below record **what happened over time** and are kept
 * strictly separate from the current-state tables above (companies/jobs/
 * applications). Current state answers "what is true now"; historical data
 * answers "what happened". Per the locked Phase 01.1 architecture, the
 * current-state tables are never touched by this layer.
 */

/**
 * AgentRuns — one row per execution of an agent (OBS-01). Emitted centrally by
 * the run-history framework (Plan 03), not by agents themselves. Carries the
 * full lifecycle (startedAt/finishedAt/status), the work counters
 * (processed/succeeded/failed), and the cost telemetry (durationMs/tokens/
 * estimatedCost) the observability layer reports on. Indexed by `agent` so
 * run-history queries ("all runs of the collector") stay cheap.
 */
export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Logical agent name (e.g. 'collector', 'scorer'). */
    agent: text('agent').notNull(),
    /** When the run began. */
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    /** When the run ended, null while in-flight. */
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    /** Lifecycle status; defaults to STARTED on insert. */
    status: text('status')
      .$type<'STARTED' | 'RUNNING' | 'SUCCESS' | 'FAILED'>()
      .notNull()
      .default('STARTED'),
    /** Items the run handled. */
    processed: integer('processed').notNull().default(0),
    /** Items that succeeded. */
    succeeded: integer('succeeded').notNull().default(0),
    /** Items that failed. */
    failed: integer('failed').notNull().default(0),
    /** Wall-clock duration in ms, null until finished. */
    durationMs: integer('duration_ms'),
    /** Total LLM tokens consumed. */
    tokens: integer('tokens').notNull().default(0),
    /** Estimated run cost in currency units (real for sub-cent precision). */
    estimatedCost: real('estimated_cost').notNull().default(0),
    /** Error message when status is FAILED, null otherwise. */
    error: text('error'),
    /** Free-form JSON metadata (run-specific context). */
    metadata: text('metadata'),
  },
  (table) => [
    // Run-history queries filter/group by agent.
    index('agent_runs_agent_idx').on(table.agent),
  ],
);

/**
 * JobEvents — the **append-only** audit trail of everything that happened to a
 * job (EVT-01). Deliberately has no `updatedAt`: rows are written once and
 * never mutated, so a job's full history is reconstructable purely by querying
 * its events in order. Indexed by `jobId` for that history reconstruction.
 */
export const jobEvents = sqliteTable(
  'job_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** FK -> jobs.id. */
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),
    /** Agent that emitted the event. */
    agent: text('agent').notNull(),
    /** Event name (e.g. 'JOB_DISCOVERED', 'JOB_SCORED'). Free-form text. */
    event: text('event').notNull(),
    /** Optional JSON payload describing the event. */
    payload: text('payload'),
    // Append-only: createdAt only, NO updatedAt — events are never mutated.
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // Reconstruct a single job's full history by query.
    index('job_events_job_id_idx').on(table.jobId),
  ],
);

/**
 * Artifacts — a **generic** registry of files produced for a job (ART-01).
 * `type` is free-form text (NOT an enum) and `metadata` is JSON, so a brand-new
 * artifact kind needs no schema change or migration. The composite (jobId,
 * type) index serves both list-by-job and list-by-type lookups.
 */
export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** FK -> jobs.id. */
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),
    /** Free-form artifact kind (e.g. 'resume_pdf'); new types need no migration. */
    type: text('type').notNull(),
    /** Filesystem (or storage) path to the artifact. */
    path: text('path').notNull(),
    /** MIME type, when known. */
    mimeType: text('mime_type'),
    /** Free-form JSON metadata. */
    metadata: text('metadata'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // Serves both list-by-job and list-by-(job,type) lookups.
    index('artifacts_job_id_type_idx').on(table.jobId, table.type),
  ],
);

/** Inferred row types — Plan 04 repositories consume these. */
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type JobEvent = typeof jobEvents.$inferSelect;
export type NewJobEvent = typeof jobEvents.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
