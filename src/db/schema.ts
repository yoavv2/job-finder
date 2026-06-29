import { sql } from 'drizzle-orm';
import {
  index,
  integer,
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

/** Inferred row types — Plan 04 repositories consume these. */
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
