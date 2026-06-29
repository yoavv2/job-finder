---
phase: 01-foundations
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - package.json
  - drizzle.config.ts
  - src/db/schema.ts
  - src/db/status.ts
  - src/db/status.test.ts
  - src/db/client.ts
  - src/db/client.test.ts
  - src/db/migrations/
autonomous: true
requirements: [FND-04, FND-05, FND-08, COMP-01]
must_haves:
  truths:
    - "A migrated SQLite database file is created with Companies, Jobs, and Applications tables"
    - "The database opens in WAL mode (journal_mode=wal) with a busy_timeout set"
    - "The job-status state machine NEW -> SCORING -> SCORED -> TAILORING -> TAILORED plus REJECTED_LOW_SCORE / ERROR is defined, and allowed transitions are queryable/enforceable"
    - "Companies model the emergent KB fields: ats, boardToken, careersUrl, website, firstSeenAt, lastSeenAt, active"
  artifacts:
    - path: "src/db/schema.ts"
      provides: "Drizzle table defs for companies, jobs, applications (the typed schema)"
      contains: "sqliteTable"
    - path: "src/db/status.ts"
      provides: "JobStatus enum/union + ALLOWED_TRANSITIONS map + canTransition()/assertTransition()"
      exports: ["JobStatus", "canTransition", "assertTransition", "ALLOWED_TRANSITIONS"]
    - path: "src/db/client.ts"
      provides: "better-sqlite3 + drizzle client with WAL + busy_timeout pragmas, migrate-on-open"
      exports: ["createDb", "Database"]
    - path: "src/db/migrations"
      provides: "drizzle-kit generated migration SQL for the three tables"
  key_links:
    - from: "src/db/client.ts"
      to: "better-sqlite3 pragmas"
      via: "PRAGMA journal_mode=WAL and PRAGMA busy_timeout on connection open"
      pattern: "journal_mode|busy_timeout"
    - from: "src/db/client.ts"
      to: "src/db/schema.ts"
      via: "drizzle(sqlite, { schema })"
      pattern: "drizzle\\("
    - from: "src/db/status.ts"
      to: "src/db/schema.ts"
      via: "jobs.status column typed/constrained to JobStatus values"
      pattern: "status"
---

<objective>
Create the persistence schema and connection layer: Drizzle table definitions for `Companies` (emergent KB), `Jobs`, and `Applications`; a migration; a better-sqlite3 client that opens in WAL mode with a `busy_timeout` and applies migrations; and the job-status state machine (states + allowed-transition map + enforcement helpers).

Purpose: This is the durable substrate the entire pipeline coordinates through (DB-as-message-bus). Repositories (Plan 04) and the agent contract (Plan 05) build directly on these tables, this client, and this state machine. The atomic claim/transition *helpers* live in Plan 04; this plan defines the schema, connection, and the transition *rules*.
Output: A migrated SQLite DB opening in WAL + busy_timeout with three tables, plus a tested state-machine module.
</objective>

<execution_context>
@/Users/yoavhevroni/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yoavhevroni/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/01-foundations/01-SUMMARY.md

Depends on Plan 01: uses the `Config` type and `loadConfig()` (`database.path`) from `src/config`.

Stack decisions (locked, STACK.md):
- ORM: `drizzle-orm ^0.45` + `drizzle-kit ^0.31`, driver `better-sqlite3 ^12` (synchronous).
- Schema-as-TypeScript (no codegen). Migrations via drizzle-kit.

Pitfalls to honor:
- #9 SQLite contention: open with `PRAGMA journal_mode=WAL` AND `PRAGMA busy_timeout=<ms>` on every connection. (synchronous better-sqlite3, single process for v1.)
- #8 idempotency: the status state machine is the backbone — define it precisely here.

State machine (locked, success criterion #3):
  NEW -> SCORING -> SCORED -> TAILORING -> TAILORED
  branch: SCORING/SCORED can go to REJECTED_LOW_SCORE (terminal)
  any non-terminal state can go to ERROR (terminal-ish, carries last_error)
  REJECTED_LOW_SCORE, TAILORED, ERROR are terminal.

Companies = emergent KB (COMP-01): id, name, ats, boardToken, careersUrl, website, firstSeenAt, lastSeenAt, active.

Jobs table (shape needed now; Discovery in Phase 2 will use it): id, companyId (FK), externalId, source/ats, title, location, url, description, postedDate, status (JobStatus), score, claimedBy, claimedAt, lastError, discoveredAt, scoredAt, createdAt, updatedAt. Include a unique dedup key on (ats/source + externalId).

Applications table: id, jobId (FK), status, resumePath, scoreSnapshot, createdAt, updatedAt.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Define the job-status state machine</name>
  <files>src/db/status.ts, src/db/status.test.ts</files>
  <behavior>
    - canTransition('NEW','SCORING') === true; canTransition('SCORING','SCORED') === true; canTransition('SCORED','TAILORING') === true; canTransition('TAILORING','TAILORED') === true.
    - canTransition('NEW','TAILORED') === false (illegal skip).
    - canTransition('SCORING','REJECTED_LOW_SCORE') === true and canTransition('SCORED','REJECTED_LOW_SCORE') === true.
    - canTransition(anyNonTerminal,'ERROR') === true.
    - canTransition('TAILORED', anything) === false (terminal); same for REJECTED_LOW_SCORE and ERROR.
    - assertTransition(from,to) throws a clear Error when canTransition is false, no-ops when true.
  </behavior>
  <action>
    Export `export type JobStatus = 'NEW'|'SCORING'|'SCORED'|'TAILORING'|'TAILORED'|'REJECTED_LOW_SCORE'|'ERROR';`
    Export `JOB_STATUSES` (readonly array of all values).
    Export `ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]>` encoding the machine in <context>. Terminal states map to `[]`. Every non-terminal includes `'ERROR'`.
    Export `canTransition(from: JobStatus, to: JobStatus): boolean`.
    Export `assertTransition(from: JobStatus, to: JobStatus): void` that throws `new Error(\`illegal status transition: ${from} -> ${to}\`)` when not allowed.
    Keep this module pure (no DB import) so it's trivially unit-testable and reusable by the repository layer.
  </action>
  <verify>
    <automated>pnpm test -- src/db/status.test.ts</automated>
  </verify>
  <done>State machine module enforces every transition in the spec; illegal transitions return false / throw; terminal states accept no transitions; tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Drizzle schema for Companies, Jobs, Applications + generated migration</name>
  <files>src/db/schema.ts, drizzle.config.ts, src/db/migrations/, package.json</files>
  <action>
    Install: `pnpm add drizzle-orm better-sqlite3` and `pnpm add -D drizzle-kit @types/better-sqlite3`.

    src/db/schema.ts (Drizzle `sqliteTable`):
    - `companies`: id (text/uuid PK or integer autoincrement — use text uuid via `crypto.randomUUID` default), name (text not null), ats (text), boardToken (text), careersUrl (text), website (text), firstSeenAt (integer timestamp), lastSeenAt (integer timestamp), active (integer boolean, default true).
    - `jobs`: id (PK), companyId (text FK -> companies.id), externalId (text), source (text — the ats), title (text not null), location (text), url (text), description (text), postedDate (integer ts), status (text, default 'NEW'; type it to JobStatus via `$type<JobStatus>()` imported from ./status), score (integer), claimedBy (text), claimedAt (integer ts), lastError (text), discoveredAt (integer ts), scoredAt (integer ts), createdAt/updatedAt (integer ts). Add a UNIQUE index on (source, externalId) for cross-run dedup (Pitfall #4 — stable identity key).
    - `applications`: id (PK), jobId (text FK -> jobs.id), status (text), resumePath (text), scoreSnapshot (integer), createdAt/updatedAt.
    Export inferred types: `export type Company = typeof companies.$inferSelect;` etc. (Select + Insert for each table) — Plan 04 repositories consume these.

    drizzle.config.ts: dialect 'sqlite', schema './src/db/schema.ts', out './src/db/migrations', dbCredentials url from config/env.

    Generate the migration: `pnpm drizzle-kit generate` — commit the produced SQL under src/db/migrations/.
  </action>
  <verify>
    <automated>pnpm typecheck && ls src/db/migrations/*.sql | head -1</automated>
  </verify>
  <done>Three tables defined in Drizzle with the COMP-01 emergent-KB fields, jobs.status typed to JobStatus, unique dedup index on (source, externalId); migration SQL generated; inferred Select/Insert types exported; typecheck clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: SQLite client with WAL + busy_timeout and migrate-on-open</name>
  <files>src/db/client.ts, src/db/client.test.ts, package.json</files>
  <behavior>
    - createDb({ path }) returns a drizzle instance; the underlying file is created.
    - After open, `PRAGMA journal_mode` returns 'wal'.
    - After open, `PRAGMA busy_timeout` returns the configured value (> 0).
    - Migrations are applied so the companies/jobs/applications tables exist (a SELECT against each table succeeds).
    - Calling createDb with an in-memory or temp path works for tests (no leftover files).
  </behavior>
  <action>
    src/db/client.ts:
    - `export function createDb(opts: { path: string; busyTimeoutMs?: number }) { ... }`
    - Open `new BetterSqlite3(opts.path)`. Immediately run `sqlite.pragma('journal_mode = WAL')` and `sqlite.pragma(\`busy_timeout = ${opts.busyTimeoutMs ?? 5000}\`)`.
    - `const db = drizzle(sqlite, { schema });`
    - Apply migrations on open using drizzle's `migrate(db, { migrationsFolder: 'src/db/migrations' })` (better-sqlite3 migrator).
    - Export `db`, the raw `sqlite` handle (Plan 04 needs raw handle for `BEGIN IMMEDIATE` atomic claim), and a `Database` type alias for the returned shape.
    - Provide a convenience `export function createDbFromConfig(config: Config)` that maps `config.database.path` -> createDb.
    src/db/client.test.ts (Vitest): create a temp db path (e.g. in os.tmpdir or ':memory:' won't persist WAL — use a temp file), assert pragmas via `sqlite.pragma('journal_mode', { simple: true })` === 'wal' and busy_timeout > 0, assert each table is selectable. Clean up temp files in afterEach.
  </action>
  <verify>
    <automated>pnpm test -- src/db/client.test.ts</automated>
  </verify>
  <done>createDb opens better-sqlite3 in WAL with busy_timeout, applies migrations so all three tables exist, exposes both the drizzle db and the raw sqlite handle; tests prove WAL + busy_timeout + tables; tests green.</done>
</task>

</tasks>

<verification>
- `pnpm test` passes (status + client tests green).
- `pnpm typecheck` clean.
- A created DB file reports `journal_mode=wal` and a non-zero `busy_timeout`.
- Companies, Jobs, Applications tables exist post-migration; jobs has a unique (source, externalId) index.
- State machine rejects illegal transitions (e.g. NEW->TAILORED) and accepts the full legal path.
</verification>

<success_criteria>
Contributes to phase success criterion #2 (WAL + busy_timeout + three tables incl. Companies emergent KB) and #3 (state machine defined + enforceable). The atomic claim/transition helper and "no raw SQL outside repository" guarantee land in Plan 04, which builds on this schema and client.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/02-SUMMARY.md` documenting the table shapes, exported Drizzle types (Company/Job/Application Select+Insert), the `createDb`/`createDbFromConfig` exports, the raw sqlite handle availability, and the state-machine API (JobStatus, canTransition, assertTransition) so Plan 04 and Plan 05 can build on them.
</output>
