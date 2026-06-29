---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 01.1-01-PLAN.md
last_updated: "2026-06-29T14:56:45.253Z"
last_activity: "2026-06-29 — Completed 01.1-01 (historical-data tables: agent_runs, append-only job_events, generic artifacts registry + inferred types + migration 0001 applied on open); 6/6 schema tests green, typecheck clean, current-state tables untouched."
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 10
  completed_plans: 7
  percent: 70
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-29)

**Core value:** Reduce manual job-search work by 90%+ while maintaining high application quality — the discovery → matching → resume-tailoring loop runs autonomously and produces trustworthy, job-specific resumes.
**Current focus:** Phase 1.1 — Observability, Auditability & Resume Source of Truth

## Current Position

Phase: 1.1 (Observability, Auditability & Resume Source of Truth)
Plan: 1 of 5 in current phase complete
Status: Phase 1.1 in progress — Plan 01.1-01 done (historical-data schema)
Last activity: 2026-06-29 — Completed 01.1-01 (historical-data tables: agent_runs, append-only job_events, generic artifacts registry + inferred types + migration 0001 applied on open); 6/6 schema tests green, typecheck clean, current-state tables untouched.

Progress: [███████░░░] 70%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 5 | 2 tasks | 10 files |
| Phase 01 P04 | 12 | 3 tasks | 9 files |
| Phase 01-foundations P05 | 4 | 3 tasks | 6 files |
| Phase 01.1 P01 | 6 | 1 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 5 phases derived from dependency-driven build order (Foundations → Discovery → Matching → Resume → Scheduler/Hardening)
- [Phase 1]: LLM provider interface + two impls land in Foundations — both Matching and Resume depend on it before either agent is built
- [Architecture]: Drizzle ORM + better-sqlite3, DB-as-message-bus via status fields, atomic `BEGIN IMMEDIATE` claim under WAL + busy_timeout
- [Phase 4]: Resume integrity enforced mechanically by a deterministic entity-diff validator (non-negotiable acceptance criterion), not by prompt wording
- [Architecture]: Source (ATS provider) ≠ Company (emergent entity). Two independent pipelines meet only at the `Companies` table — Company Discovery (future) vs Job Discovery (v1). v1 seeds companies as a bootstrap; Job Discovery reads Company records and is agnostic to how they arrived
- [Roadmap]: Phase 2 reframed as "Job Discovery" over seeded Companies (Collector dispatches by `ats`); Company Discovery, Enrichment, and a Curation layer are v2/future
- [Phase 01]: Config: single Zod schema (ConfigSchema) is the source of truth; Config type via z.infer; loadConfig parses YAML, validates fail-fast, and freezes the result
- [Phase 01]: Secrets: getEnv() reading process.env/.env is the only sanctioned key-read path; keys never in config.yaml or source; .env gitignored from first commit
- [Phase 01]: Toolchain: requires Node >=22 (use nvm v22.22.0) and corepack pnpm@9 — system pnpm 7 + Node 19 fail with ERR_INVALID_THIS
- [Phase 01]: Repository layer hides Drizzle/raw SQL inside src/db; agents depend on JobRepository/CompanyRepository/ApplicationRepository via buildRepositories(handle)
- [Phase 01]: Atomic claim = single BEGIN IMMEDIATE UPDATE...WHERE status=from ... RETURNING on the raw sqlite handle; proven by overlap test to never double-process a job
- [Phase 01-foundations]: Agent core: unified Agent interface + Map-based open/closed AgentRegistry; buildContext(config, overrides) does manual DI wiring repos+llm+config+pino-logger+injected clock into one AgentContext (no DI framework, no god base class)
- [Phase 01.1]: Current-state (Jobs/Applications/Companies) vs historical-data (AgentRuns/JobEvents/Artifacts) are kept strictly separate; run history is emitted centrally by the agent-running framework, not by agents; events are append-only; artifacts are a generic typed table (no per-type path columns)
- [Phase 01.1]: Resume is structured data (resume/master.yaml) as the source of truth — PDFs are output-only, never parsed; tailoring is structured-in/structured-out; integrity validation is a deterministic structured-vs-structured entity-diff. Phase 4 RESUME reqs rewritten to build on this substrate
- [Phase 01.1]: Historical-data tables added: agent_runs (run telemetry), append-only job_events (audit), generic artifacts registry (free-form type + JSON metadata, no per-type migration); current-state tables untouched

### Roadmap Evolution

- Phase 1.1 inserted after Phase 1: Observability, Auditability & Resume Source of Truth (INSERTED — foundational capabilities cheaper to add before pipeline agents exist). Added 12 reqs (OBS/EVT/ART/RES); rewrote Phase 4 RESUME-02..05 to use the structured-resume substrate.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

None yet.

## Session Continuity

Last session: 2026-06-29T14:56:34.836Z
Stopped at: Completed 01.1-01-PLAN.md
Resume file: None
