# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-29)

**Core value:** Reduce manual job-search work by 90%+ while maintaining high application quality — the discovery → matching → resume-tailoring loop runs autonomously and produces trustworthy, job-specific resumes.
**Current focus:** Phase 1 — Foundations

## Current Position

Phase: 1 of 5 (Foundations)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-06-29 — Source/Company architecture adjustment applied; 38/38 requirements mapped across 5 phases

Progress: [░░░░░░░░░░] 0%

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

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

None yet.

## Session Continuity

Last session: 2026-06-29 12:28
Stopped at: Source/Company architecture adjustment applied across PROJECT/REQUIREMENTS/ROADMAP/STATE
Resume file: None
