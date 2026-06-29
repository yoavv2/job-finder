---
phase: 01-foundations
plan: 04
subsystem: database
tags: [drizzle, better-sqlite3, repository-pattern, atomic-claim, state-machine, sqlite, wal]

# Dependency graph
requires:
  - phase: 01-foundations (Plan 02)
    provides: "createDb (Drizzle db + raw sqlite handle, WAL + busy_timeout), schema tables/types, JobStatus state machine (assertTransition/canTransition)"
provides:
  - "JobRepository: insertNew (dedup-idempotent), findByStatus, getById, claimByStatus (atomic BEGIN IMMEDIATE claim), transition (state-machine-checked)"
  - "CompanyRepository: upsert (firstSeenAt-once / lastSeenAt-bumped, identity = ats+boardToken else name), findActive, touchLastSeen"
  - "ApplicationRepository: create, getById, setResumePath, updateStatus"
  - "buildRepositories(handle) factory that constructs all three repos from a createDb Database handle"
  - "Concurrency proof that the atomic claim never double-processes across overlapping/back-to-back passes"
affects: [05 AgentContext, Phase 2 Job Discovery, Phase 3 Matching, Phase 4 Resume]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Repository layer (Pattern 5): Drizzle/raw SQL live ONLY in src/db; agents depend on repository classes"
    - "Atomic claim (Pattern 2): single BEGIN IMMEDIATE UPDATE...WHERE status IN(SELECT LIMIT) RETURNING moves rows out of the from-status in one statement"
    - "App-level upsert identity resolution when no DB unique constraint exists"
    - "Raw-row -> Drizzle-shape mapper (snake_case + integer epoch -> camelCase + Date)"

key-files:
  created:
    - src/db/repositories/job-repository.ts
    - src/db/repositories/job-repository.test.ts
    - src/db/repositories/claim.test.ts
    - src/db/repositories/company-repository.ts
    - src/db/repositories/company-repository.test.ts
    - src/db/repositories/application-repository.ts
    - src/db/repositories/application-repository.test.ts
    - src/db/repositories/index.ts
    - src/db/repositories/index.test.ts
  modified: []

key-decisions:
  - "claimByStatus uses the raw better-sqlite3 handle's immediate-mode transaction (BEGIN IMMEDIATE) for the single-statement claim; Drizzle is used for all ordinary CRUD"
  - "insertNew uses onConflictDoNothing on (source, externalId) and returns the existing row on conflict — dedup is idempotent (Pitfall #4)"
  - "CompanyRepository.upsert resolves identity in app code (ats+boardToken when both present, else name) because the companies table has no DB-level unique constraint; firstSeenAt is written once on insert, lastSeenAt always bumped"
  - "transition injects scoredAt on SCORED and requires lastError on ERROR; clock is injectable on company methods for deterministic tests"

patterns-established:
  - "Repository pattern: ORM hidden behind repos; verified no drizzle-orm/better-sqlite3 import or raw .prepare/.exec exists outside src/db/"
  - "Atomic status claim as the DB-as-message-bus primitive, proven safe by an overlap test"

requirements-completed: [FND-06, FND-08]

# Metrics
duration: 12min
completed: 2026-06-29
---

# Phase 1 Plan 04: Repository Layer Summary

**Repository layer wrapping all DB access (Drizzle hidden behind JobRepository/CompanyRepository/ApplicationRepository), including an atomic BEGIN IMMEDIATE status-claim proven by an overlap test never to double-process a job.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-29T17:05:00Z
- **Completed:** 2026-06-29T17:17:00Z
- **Tasks:** 3
- **Files modified:** 9 created (3 impl + 1 barrel + 5 test)

## Accomplishments
- JobRepository with the atomic `claimByStatus` claim (single BEGIN IMMEDIATE `UPDATE ... WHERE status IN (SELECT ... LIMIT) RETURNING *`) and a state-machine-checked `transition`; inserts are dedup-idempotent on (source, externalId).
- Concurrency/overlap proof: two back-to-back claim passes whose limits sum past N share zero ids, drain NEW exactly once, and the third claim is an idempotent no-op.
- CompanyRepository (upsert with firstSeenAt-once/lastSeenAt-bump, findActive, touchLastSeen) and ApplicationRepository (create/getById/setResumePath/updateStatus).
- `buildRepositories(handle)` factory — the single seam Plan 05's buildContext and Phase 2-4 agents use to obtain DB access without touching the ORM.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: JobRepository (atomic claim + transition)** - `26cc637` (test) → `dfd5552` (feat)
2. **Task 2: Overlap/double-processing proof** - `1b9ec09` (test) — implementation already satisfied by Task 1
3. **Task 3: Company + Application repos + barrel** - `741754b` (test) → `c40363a` (feat)

**Plan metadata:** (this commit) docs: complete plan

## Files Created/Modified
- `src/db/repositories/job-repository.ts` - JobRepository: insertNew/findByStatus/getById/claimByStatus/transition + raw-row mapper
- `src/db/repositories/job-repository.test.ts` - dedup, queries, atomic claim, transition rules
- `src/db/repositories/claim.test.ts` - overlap/no-double-processing concurrency proof
- `src/db/repositories/company-repository.ts` - CompanyRepository: upsert/findActive/touchLastSeen
- `src/db/repositories/company-repository.test.ts` - upsert identity + firstSeenAt/lastSeenAt semantics
- `src/db/repositories/application-repository.ts` - ApplicationRepository: create/getById/setResumePath/updateStatus
- `src/db/repositories/application-repository.test.ts` - create + artifact path + status update
- `src/db/repositories/index.ts` - barrel + buildRepositories(handle) factory
- `src/db/repositories/index.test.ts` - factory wiring

## Decisions Made
- Atomic claim via the raw better-sqlite3 immediate-mode transaction (BEGIN IMMEDIATE); Drizzle for ordinary CRUD. The claim's `WHERE status = from` filter + atomic row-move is the structural guarantee that overlapping passes cannot re-claim.
- CompanyRepository.upsert resolves identity in app code (the companies table carries no DB unique index): prefer (ats, boardToken) when both present, else name.
- A raw-row-to-Drizzle-shape mapper normalizes the `RETURNING *` rows (snake_case columns, integer epoch ms) into the inferred `Job` type (camelCase, `Date`), so callers see one consistent row type regardless of access path.

## Deviations from Plan
None - plan executed exactly as written. (Task 2's implementation was already satisfied by Task 1's JobRepository, so Task 2 added only the proving test — consistent with the plan, which scopes Task 2 to `claim.test.ts`.)

## Issues Encountered
None. Default Node is 19.3.0; Node 22.22.0 was activated via nvm for all pnpm commands, per the environment note, avoiding the ERR_INVALID_THIS failure.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1 success criterion #2 fully met: SQLite exposed exclusively through the repository layer (verified: no drizzle/better-sqlite3 import or raw SQL outside src/db/), with an atomic claim proven not to double-process.
- Enforcement half of criterion #3 met: state-machine-checked transitions via the repository.
- Plan 05 (AgentContext) can build directly on `buildRepositories(handle)`; Phase 2-4 agents depend on the repository classes, never the ORM.
- 86/86 tests green, typecheck clean.

## Self-Check: PASSED

All 9 created files exist on disk; all 5 task commits (26cc637, dfd5552, 1b9ec09, 741754b, c40363a) are present in history.

---
*Phase: 01-foundations*
*Completed: 2026-06-29*
