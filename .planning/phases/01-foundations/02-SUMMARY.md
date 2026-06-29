---
phase: 01-foundations
plan: 02
subsystem: database
tags: [drizzle, better-sqlite3, sqlite, wal, state-machine, migrations]

# Dependency graph
requires:
  - phase: 01-foundations (Plan 01)
    provides: Config type and loadConfig (database.path) consumed by createDbFromConfig
provides:
  - Drizzle schema for companies (emergent KB), jobs, applications with inferred Select/Insert types
  - SQLite client (createDb/createDbFromConfig) opening in WAL + busy_timeout, migrate-on-open
  - Raw better-sqlite3 handle exposed for atomic BEGIN IMMEDIATE claim (used by Plan 04)
  - Job-status state machine (JobStatus, JOB_STATUSES, ALLOWED_TRANSITIONS, canTransition, assertTransition)
  - Generated migration SQL creating all three tables + unique (source, external_id) dedup index
affects: [Plan 04 (repositories), Plan 05 (agent contract), Phase 2 (Job Discovery)]

# Tech tracking
tech-stack:
  added: [drizzle-orm ^0.45, better-sqlite3 ^12, drizzle-kit ^0.31, "@types/better-sqlite3"]
  patterns:
    - "Schema-as-TypeScript (no codegen); migrations via drizzle-kit generate"
    - "WAL + busy_timeout pragmas applied on every connection open (Pitfall #9)"
    - "DB-as-message-bus: jobs.status typed to JobStatus, indexed for queue scans"
    - "Pure, DB-free state-machine module reusable by repository/agent layers"

key-files:
  created:
    - src/db/status.ts
    - src/db/status.test.ts
    - src/db/schema.ts
    - src/db/client.ts
    - src/db/client.test.ts
    - drizzle.config.ts
    - src/db/migrations/0000_open_sunfire.sql
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Text UUID primary keys defaulted via crypto.randomUUID() $defaultFn (stable app-side ids)"
  - "Timestamps stored as integer epoch-millis (mode: timestamp_ms) so Drizzle returns Date objects"
  - "Booleans stored as integers (mode: boolean); jobs/applications createdAt/updatedAt default to unixepoch()*1000 in SQL"
  - "Added a jobs.status index (beyond the spec) since status is the message-bus scan column"
  - "Migrations folder resolved relative to client.ts module (import.meta.url) so migrate-on-open is cwd-independent"

patterns-established:
  - "Every DB connection opens WAL + busy_timeout before use"
  - "Status transitions guarded by assertTransition() at write sites"
  - "Inferred Drizzle Select/Insert types are the typed contract for the repository layer"

requirements-completed: [FND-04, FND-05, FND-08, COMP-01]

# Metrics
duration: 19min
completed: 2026-06-29
---

# Phase 1 Plan 02: Persistence Schema & Connection Layer Summary

**Drizzle schema (companies emergent-KB + jobs + applications) on a better-sqlite3 client that opens in WAL with busy_timeout and migrate-on-open, plus a pure job-status state machine enforcing NEW->SCORING->SCORED->TAILORING->TAILORED.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-06-29T10:32:31Z
- **Completed:** 2026-06-29T10:52:18Z
- **Tasks:** 3
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- Job-status state machine: `JobStatus` union, `JOB_STATUSES`, `ALLOWED_TRANSITIONS`, `canTransition()`, `assertTransition()` — pure module, no DB import (19 unit tests).
- Drizzle `sqliteTable` defs for `companies` (COMP-01 emergent KB: ats, boardToken, careersUrl, website, firstSeenAt, lastSeenAt, active), `jobs` (status typed to JobStatus, claim columns, unique `(source, external_id)` dedup index + status index), `applications`. Exported Select/Insert inferred types for all three.
- Generated migration `0000_open_sunfire.sql` creating all three tables and indexes.
- `createDb({ path, busyTimeoutMs })` opens better-sqlite3 with `journal_mode=WAL` + `busy_timeout` (default 5000ms), applies migrations on open, returns the typed Drizzle `db` plus the raw `sqlite` handle; `createDbFromConfig(config)` maps `config.database.path`. Verified by 7 client tests.

## Task Commits

Each task was committed atomically (TDD tasks have test -> feat commits):

1. **Task 1: Job-status state machine (TDD)** - `a4cc490` (test) -> `e758f50` (feat)
2. **Task 2: Drizzle schema + generated migration** - `857148d` (feat)
3. **Task 3: SQLite client WAL + busy_timeout + migrate-on-open (TDD)** - `1416b0d` (test) -> `1226e77` (feat)

_Note: 01-03 commits are interleaved in git log because that plan executed in a parallel wave._

## Files Created/Modified
- `src/db/status.ts` - Pure job-status state machine (states, transition map, can/assertTransition).
- `src/db/status.test.ts` - 19 tests covering happy path, illegal skips, rejection branch, ERROR reachability, terminal states.
- `src/db/schema.ts` - Drizzle defs for companies/jobs/applications + inferred Select/Insert types.
- `src/db/client.ts` - createDb/createDbFromConfig; WAL + busy_timeout + migrate-on-open; exposes raw sqlite handle.
- `src/db/client.test.ts` - 7 tests (file creation, WAL, busy_timeout, table selectability, unique dedup index, drizzle instance).
- `drizzle.config.ts` - drizzle-kit config (sqlite dialect, schema/out paths, DATABASE_PATH credential).
- `src/db/migrations/0000_open_sunfire.sql` - Generated migration for all three tables + indexes.
- `package.json` / `pnpm-lock.yaml` - Added drizzle-orm, better-sqlite3, drizzle-kit, @types/better-sqlite3.

## Decisions Made
- Text UUID PKs defaulted via `crypto.randomUUID()` (`$defaultFn`).
- Timestamps as integer epoch-millis (`mode: 'timestamp_ms'`); booleans as integers (`mode: 'boolean'`).
- `jobs.status` typed via `$type<JobStatus>()`, default `'NEW'`, with a dedicated status index for message-bus queue scans.
- Migrations folder resolved relative to the client module so migrate-on-open is cwd-independent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a status index on jobs**
- **Found during:** Task 2 (schema definition)
- **Issue:** Status is the DB-as-message-bus column scanned to pick up work; without an index, queue scans degrade to full-table scans as jobs accumulate.
- **Fix:** Added `index('jobs_status_idx').on(table.status)` alongside the spec's unique `(source, external_id)` index.
- **Files modified:** src/db/schema.ts, src/db/migrations/0000_open_sunfire.sql
- **Verification:** Migration generated with the index; typecheck + full suite green.
- **Committed in:** 857148d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical).
**Impact on plan:** Necessary for queue-scan performance; no scope creep. All spec artifacts and key-links delivered exactly as written.

## Issues Encountered
- Default Node is v19.3.0 which fails with `corepack pnpm` (ERR_INVALID_THIS). Resolved per environment note by activating nvm v22.22.0 before every pnpm/node command.

## User Setup Required
None - no external service configuration required. (Runtime DB path comes from validated config; drizzle-kit CLI reads optional `DATABASE_PATH`, defaulting to `./data/job-finder.db`.)

## Next Phase Readiness
- Plan 04 (repositories) can build on `createDb`/`createDbFromConfig`, the exported Drizzle types, the raw sqlite handle for `BEGIN IMMEDIATE`, and `assertTransition()` for guarded status writes.
- Plan 05 (agent contract) can consume the state machine and Job types.
- No blockers.

---
*Phase: 01-foundations*
*Completed: 2026-06-29*
