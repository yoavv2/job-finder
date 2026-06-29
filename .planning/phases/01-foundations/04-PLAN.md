---
phase: 01-foundations
plan: 04
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/db/repositories/job-repository.ts
  - src/db/repositories/job-repository.test.ts
  - src/db/repositories/company-repository.ts
  - src/db/repositories/application-repository.ts
  - src/db/repositories/index.ts
  - src/db/repositories/claim.test.ts
autonomous: true
requirements: [FND-06, FND-08]
must_haves:
  truths:
    - "All DB reads/writes for Companies, Jobs, Applications go through a repository layer (no raw SQL in agents/consumers)"
    - "An atomic status-claim helper transitions rows from one status to the next under BEGIN IMMEDIATE, proven not to double-process under overlapping calls"
    - "Status transitions performed via the repository are validated against the state machine (illegal transitions rejected)"
  artifacts:
    - path: "src/db/repositories/job-repository.ts"
      provides: "JobRepository: CRUD + claimByStatus (atomic) + transition (state-machine-checked) + queries by status"
      exports: ["JobRepository"]
    - path: "src/db/repositories/company-repository.ts"
      provides: "CompanyRepository: upsert, find active, touch lastSeenAt"
      exports: ["CompanyRepository"]
    - path: "src/db/repositories/application-repository.ts"
      provides: "ApplicationRepository: create/update application rows + artifact path"
      exports: ["ApplicationRepository"]
  key_links:
    - from: "src/db/repositories/job-repository.ts"
      to: "raw sqlite BEGIN IMMEDIATE transaction"
      via: "atomic claim = single immediate transaction UPDATE ... WHERE status=from LIMIT n RETURNING"
      pattern: "BEGIN IMMEDIATE|immediate|transaction"
    - from: "src/db/repositories/job-repository.ts"
      to: "src/db/status.ts"
      via: "transition() calls assertTransition(from, to) before writing"
      pattern: "assertTransition"
    - from: "src/db/repositories/job-repository.ts"
      to: "src/db/schema.ts"
      via: "drizzle queries against jobs table (ORM hidden behind repo)"
      pattern: "jobs"
---

<objective>
Build the repository layer that wraps ALL database access (no raw SQL outside it), including the atomic status-claim/transition helper that is the heart of the DB-as-message-bus choreography — proven by a concurrency test not to double-process a row when two claims overlap — and state-machine-enforced transitions.

Purpose: Repositories are the seam that delivers "swappable DB" and makes agents unit-testable with fakes. The atomic claim is the cheap insurance against overlapping/scheduled runs double-processing jobs. This plan completes phase success criterion #2.
Output: JobRepository (with claimByStatus + transition), CompanyRepository, ApplicationRepository, and a passing overlap/double-processing test.
</objective>

<execution_context>
@/Users/yoavhevroni/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yoavhevroni/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/01-foundations/02-SUMMARY.md

Depends on Plan 02: uses the Drizzle `db`, raw `sqlite` handle, table defs (companies/jobs/applications), inferred Select/Insert types, and the state machine (`JobStatus`, `assertTransition`, `canTransition`) from `src/db`.

Architecture (locked):
- Pattern 5: agents depend on repository interfaces; ORM (Drizzle) lives ONLY in repositories. No raw SQL or Drizzle import in agents.
- Pattern 2: atomic claim. SQLite is single-writer; claiming must be ONE atomic statement to prevent double-processing under overlap. Use `BEGIN IMMEDIATE` + `UPDATE jobs SET status=<to>, claimed_by=?, claimed_at=? WHERE id IN (SELECT id FROM jobs WHERE status=<from> LIMIT n) RETURNING *`. WAL + busy_timeout (from Plan 02) make brief contention retry instead of fail.
- Keep write transactions short; never hold a transaction across network/LLM calls (Pitfall #9) — the claim is pure DB and instantaneous.

Pitfalls:
- #8 idempotency: claim by status + transition by status = re-runs are safe no-ops on already-processed rows.
- #4 dedup: CompanyRepository.upsert and JobRepository insert respect the unique (source, externalId) index — duplicate inserts are idempotent (ignore/return existing).

Note: better-sqlite3 is synchronous; the raw handle supports `db.transaction()` and `db.prepare(...).run/all`. Use the raw handle for the BEGIN IMMEDIATE claim where Drizzle's helper is awkward; use Drizzle for ordinary CRUD.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: JobRepository with atomic claim + state-machine-checked transition</name>
  <files>src/db/repositories/job-repository.ts, src/db/repositories/job-repository.test.ts</files>
  <behavior>
    - insertNew(job) creates a job with status 'NEW'; inserting a job with an existing (source, externalId) does NOT create a duplicate (idempotent — returns existing or no-ops).
    - findByStatus('NEW') returns only NEW jobs.
    - claimByStatus('NEW','SCORING', claimedBy, limit) atomically transitions up to `limit` NEW rows to SCORING, stamps claimedBy/claimedAt, and RETURNS the claimed rows.
    - transition(id,'SCORED', fields) updates status when the transition is legal; transition(id,'TAILORED') from 'NEW' throws (illegal per state machine).
    - transition to ERROR records lastError.
  </behavior>
  <action>
    `export class JobRepository { constructor(private db: DrizzleDb, private sqlite: BetterSqlite3Database) {} ... }` (take both the drizzle db and the raw sqlite handle from createDb).
    Methods:
    - `insertNew(job: NewJobInput): Job` — Drizzle insert with status 'NEW'; use `onConflictDoNothing` on the (source, externalId) unique index for idempotent dedup; return the row.
    - `findByStatus(status: JobStatus): Job[]`
    - `getById(id: string): Job | undefined`
    - `claimByStatus(from: JobStatus, to: JobStatus, claimedBy: string, limit: number): Job[]` — call `assertTransition(from, to)` first, then run an atomic claim using the raw sqlite handle inside a `BEGIN IMMEDIATE` transaction: `UPDATE jobs SET status=@to, claimed_by=@by, claimed_at=@now WHERE id IN (SELECT id FROM jobs WHERE status=@from LIMIT @limit) RETURNING *`. Return mapped rows.
    - `transition(id: string, to: JobStatus, fields?: Partial<Job>): void` — read current status, `assertTransition(current, to)`, then update status + provided fields (+ scoredAt/updatedAt as relevant); if `to==='ERROR'`, require/record `lastError`.
    job-repository.test.ts: use createDb on a temp file (real DB, real WAL). Cover all behaviors above incl. the dedup idempotency and the illegal-transition throw.
  </action>
  <verify>
    <automated>pnpm test -- src/db/repositories/job-repository.test.ts</automated>
  </verify>
  <done>JobRepository wraps all jobs access via Drizzle; claimByStatus is an atomic BEGIN IMMEDIATE claim returning claimed rows; transition is state-machine-enforced; inserts are dedup-idempotent; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Overlap/double-processing proof for the atomic claim</name>
  <files>src/db/repositories/claim.test.ts</files>
  <behavior>
    - Seed N NEW jobs (e.g. 20). Run two claimByStatus('NEW','SCORING', ...) passes back-to-back against the SAME db (simulating overlapping runs) and assert: the UNION of claimed ids has NO duplicates (no job claimed twice) and the total claimed never exceeds N.
    - After all claims, no job remains in 'NEW' if total claim capacity >= N; every claimed job is in 'SCORING' exactly once.
    - Re-running claimByStatus after everything is claimed returns an empty array (idempotent no-op).
  </behavior>
  <action>
    src/db/repositories/claim.test.ts (Vitest): build a temp DB via createDb (WAL + busy_timeout from Plan 02), seed N NEW jobs through JobRepository.insertNew. Because better-sqlite3 is synchronous and single-writer, simulate overlap by invoking two sequential claim batches with limits that together exceed N and asserting non-overlap of returned ids (the BEGIN IMMEDIATE + status filter guarantees the second batch can't re-claim rows the first already moved out of NEW). Assert: no id appears in both batches; sum of claimed == N; final 'NEW' count == 0; a third claim returns []. Document in a comment that this proves the claim is safe under overlapping/back-to-back scheduled runs.
  </action>
  <verify>
    <automated>pnpm test -- src/db/repositories/claim.test.ts</automated>
  </verify>
  <done>A concurrency/overlap test proves the atomic claim never double-processes a job across overlapping claim passes and is an idempotent no-op once drained; test green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Company + Application repositories and a barrel export</name>
  <files>src/db/repositories/company-repository.ts, src/db/repositories/application-repository.ts, src/db/repositories/index.ts</files>
  <behavior>
    - CompanyRepository.upsert(company): inserting a new company sets firstSeenAt and lastSeenAt; upserting an existing one updates lastSeenAt without changing firstSeenAt (idempotent on identity).
    - CompanyRepository.findActive() returns only companies with active=true.
    - CompanyRepository.touchLastSeen(id, now) updates lastSeenAt.
    - ApplicationRepository.create({ jobId, status, scoreSnapshot }) inserts a row; setResumePath(id, path) records the artifact path.
    - index.ts exports all three repositories and a `buildRepositories(dbHandles)` convenience that constructs them from createDb output.
  </behavior>
  <action>
    company-repository.ts: `export class CompanyRepository` with upsert (Drizzle onConflictDoUpdate keyed on a stable company identity — name or boardToken+ats; pick boardToken+ats if present else name; set firstSeenAt only on insert, always bump lastSeenAt), findActive(), touchLastSeen(). These serve Phase 2 (COMP-03) but the emergent-KB write helpers belong in the repo layer now.
    application-repository.ts: `export class ApplicationRepository` with create() and setResumePath() and updateStatus(). Serves Phase 4 artifact recording.
    index.ts: re-export JobRepository, CompanyRepository, ApplicationRepository, and `export function buildRepositories(handles: { db; sqlite }) { return { jobs: new JobRepository(...), companies: new CompanyRepository(...), applications: new ApplicationRepository(...) }; }` — Plan 05's buildContext uses this.
  </action>
  <verify>
    <automated>pnpm test -- src/db/repositories/ && pnpm typecheck</automated>
  </verify>
  <done>Company + Application repositories wrap their tables (upsert sets firstSeenAt once / always bumps lastSeenAt; findActive filters; application artifact path recordable); barrel exports all repos + buildRepositories; tests + typecheck pass.</done>
</task>

</tasks>

<verification>
- `pnpm test` passes (job-repository + claim overlap + company/application tests green).
- `pnpm typecheck` clean.
- No raw SQL or Drizzle import exists outside `src/db/` (repositories are the only DB access path).
- The overlap test proves no job is double-claimed across back-to-back claim passes.
- Illegal status transitions through the repository throw.
</verification>

<success_criteria>
Phase 1 success criterion #2 is fully met: SQLite exposed exclusively through a repository layer (no raw SQL outside it), including an atomic status-claim/transition helper proven not to double-process under overlap. Also completes the enforcement half of criterion #3 (state-machine-checked transitions via repo).
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/04-SUMMARY.md` documenting the repository APIs (JobRepository.claimByStatus/transition/insertNew/findByStatus, Company/Application repos), the `buildRepositories(handles)` factory, and the atomic-claim guarantee so Plan 05 (AgentContext) and Phase 2-4 agents build on them without touching the ORM.
</output>
