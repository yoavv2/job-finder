# Roadmap: Autonomous Job Application Agent

## Overview

This roadmap builds a plugin-based multi-agent job-application pipeline from the persistence seam outward. Phase 1 lays the entire foundation — typed config, the SQLite/Drizzle schema and repository layer, the WAL-mode atomic-claim choreography, the `Agent` interface + registry, the status state machine, and the provider-agnostic `LLMProvider` interface with two concrete implementations — because every agent above depends on it. Phases 2–4 then add the three pipeline agents in dependency order (Job Discovery reads seeded `Company` records and produces `NEW` jobs — keeping Company discovery decoupled so it can be automated later — Matching scores them into `SCORED`/`REJECTED_LOW_SCORE`, Resume tailors eligible jobs into `TAILORED` PDFs), each communicating only through the database. Phase 5 ties the independently-runnable agents together under a scheduler with an overlap guard, structured logging, and missed-run self-heal — turning a set of proven agents into an autonomous platform.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundations** - Config, persistence seam, agent/registry/state-machine contracts, and the provider-agnostic LLM layer that everything depends on (completed 2026-06-29)
- [ ] **Phase 2: Job Discovery** - Job Discovery reads seeded `Company` records, dispatches each to its ATS adapter, and syncs/dedupes/filters jobs into `NEW` rows while keeping the Companies KB current
- [ ] **Phase 3: Matching** - Matching agent scores every `NEW` job against the resume and branches to `SCORED` or `REJECTED_LOW_SCORE`
- [ ] **Phase 4: Resume Customization** - Resume agent tailors eligible jobs into integrity-validated `Resume_Company.pdf` files and marks them `TAILORED`
- [ ] **Phase 5: Scheduler & Hardening** - CLI entrypoints + scheduler with overlap guard, structured logging, and missed-run self-heal that runs the whole loop autonomously

## Phase Details

### Phase 1: Foundations
**Goal**: Stand up the typed, durable substrate every agent runs on — configuration, persistence, the agent contract + status choreography, and a provider-agnostic LLM layer — so that no agent has to invent infrastructure.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, LLM-01, LLM-02, LLM-03, LLM-04, COMP-01
**Success Criteria** (what must be TRUE):
  1. The app loads all settings from a YAML config validated by a Zod schema, fails fast with a clear error on invalid config, and reads LLM API keys from a gitignored `.env` — no hardcoded values anywhere
  2. A migrated SQLite database opens in WAL mode with a `busy_timeout` and exposes `Companies`, `Jobs`, and `Applications` tables (Companies modeled as an emergent KB: `ats, boardToken, careersUrl, website, firstSeenAt, lastSeenAt, active`) exclusively through a repository layer (no raw SQL outside it), including an atomic status-claim/transition helper proven not to double-process under overlap
  3. A unified `Agent` interface (`name`, `run(ctx)`) and a registry exist such that registering a new agent requires no change to existing agents, and the job-status state machine (`NEW → SCORING → SCORED → TAILORING → TAILORED`, plus `REJECTED_LOW_SCORE` / `ERROR`) is enforced for transitions
  4. A provider-agnostic `LLMProvider` interface with at least two concrete implementations (e.g. OpenAI + Claude) is selectable purely via `llm.provider` config, returns Zod-schema-validated structured output, and delimits/sanitizes job-description text as untrusted input
**Plans**: 5 plans
- [x] 01-foundations/01-PLAN.md — Typed YAML config (Zod) + fail-fast loader + secrets/.env boundary
- [x] 01-foundations/02-PLAN.md — Drizzle schema (Companies/Jobs/Applications) + WAL client + job-status state machine
- [x] 01-foundations/03-PLAN.md — Provider-agnostic LLMProvider (OpenAI + Anthropic) + Zod-validated structured output + JD sanitizer
- [x] 01-foundations/04-PLAN.md — Repository layer + atomic claim/transition (overlap-proven) + state-machine enforcement
- [x] 01-foundations/05-PLAN.md — Agent interface + registry + AgentContext + buildContext wiring

### Phase 01.1: Observability, Auditability and Resume Source of Truth (INSERTED)
**Goal**: Establish the observability/audit layer and the structured-resume substrate — a clean **current-state vs historical-data** separation — before any pipeline agent exists: every agent execution is recorded (`AgentRuns`, emitted centrally by the framework), every meaningful job transition is an immutable event (`JobEvents`, append-only), all generated files are generic typed `Artifacts` (no per-type path columns), and the resume lives as Zod-validated structured data rendered to PDF (never parsed from PDF). These capabilities are far cheaper to introduce now than after multiple agents exist.
**Depends on**: Phase 1
**Requirements**: OBS-01, OBS-02, OBS-03, EVT-01, EVT-02, EVT-03, ART-01, ART-02, ART-03, RES-01, RES-02, RES-03
**Success Criteria** (what must be TRUE):
  1. Running any agent through the framework automatically creates exactly one `AgentRuns` record (`agent, startedAt, finishedAt, status, processed, succeeded, failed, durationMs, tokens, estimatedCost, error, metadata`) with a STARTED→RUNNING→SUCCESS/FAILED lifecycle — the agent never writes it itself, and a thrown error still finalizes the run as FAILED with the error captured
  2. A `JobEvents` append-only table records immutable events for important transitions (`jobId, agent, event, payload, createdAt`; e.g. `JOB_DISCOVERED`, `MATCH_STARTED`, `MATCH_COMPLETED`, `MATCH_REJECTED`, `TAILOR_STARTED`, `TAILOR_COMPLETED`, `ERROR`); `Job.status` remains current-state, events are written only through the repository layer and never updated/deleted, and a job's full history is reconstructable by querying its events
  3. A generic `Artifacts` table (`jobId, type, path, mimeType, metadata, createdAt`) stores typed artifacts (`resume_pdf`, `resume_html`, `resume_json`, `cover_letter`, `llm_response`, `analysis`, `screenshot`, …) so new artifact types require no schema change; Jobs reference artifacts through this table rather than per-type path columns
  4. The resume exists as a Zod-validated structured master (`resume/master.yaml`) covering Profile, Summary, Skills, Experience, Projects, Education, Certificates, Languages; a renderer turns a structured resume into ATS-readable, single-column, selectable-text PDF via an HTML stage; and a deterministic structured-vs-structured integrity validator (entity-diff over the typed model) rejects any tailored resume introducing a company/technology/project/claim absent from the master — all without ever parsing a PDF
**Plans**: TBD (run `/gsd:plan-phase 01.1`)

### Phase 2: Job Discovery
**Goal**: Produce trustworthy `NEW` job rows by reading seeded `Company` records, dispatching each to its ATS adapter (Collector + per-ATS adapter over public JSON APIs), deduping and filtering before storage, keeping the Companies KB current, and surviving individual company/source failures — with the seam designed so an automated Company Discovery agent can later replace seeding without touching this pipeline.
**Depends on**: Phase 1
**Requirements**: COMP-02, COMP-03, DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07, DISC-08
**Success Criteria** (what must be TRUE):
  1. Companies are bootstrapped from a seed (explicitly temporary), and Job Discovery reads `active` companies with a known `ats` + `boardToken` and syncs their jobs — never depending on how those companies were discovered
  2. A Collector dispatches each company to the correct per-ATS adapter by `ats` field, with Greenhouse working first and Lever/Ashby/Workable each added as a single additive adapter file normalizing into the common `Jobs` shape
  3. Jobs are deduplicated on a stable identity key (`ats`/source + external id) so re-runs create no duplicates, stored with `status = NEW`, linked to their `Company`, with discovery metadata (source, url, postedDate, discoveredAt); syncing updates the company's `lastSeenAt` (upserting an unrecorded company)
  4. Jobs are filtered by configured keywords, location/country, and seniority before storage, so irrelevant roles never enter the pipeline
  5. Discovery paces requests politely with backoff/retry and a single failing company/source does not abort the whole run
**Plans**: TBD

### Phase 3: Matching
**Goal**: Score every `NEW` job against the resume exactly once, persist structured analysis, and branch jobs into `SCORED` or `REJECTED_LOW_SCORE` without re-spending tokens on repeat runs.
**Depends on**: Phase 2
**Requirements**: MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05
**Success Criteria** (what must be TRUE):
  1. Running the matching agent reads every `NEW` job and produces a 0–100 fit score against the resume/skills/experience, with a cheap keyword pre-filter short-circuiting obviously-irrelevant jobs before any LLM call
  2. Each job's structured result `{ score, strengths[], missingSkills[], recommendation }` is persisted to its row, and scoring is idempotent so a daily re-run never re-scores an already-scored job
  3. Jobs below `minimumMatchScore` are marked `REJECTED_LOW_SCORE` and jobs at/above advance to `SCORED`, with the threshold read from config
**Plans**: TBD

### Phase 4: Resume Customization
**Goal**: Turn eligible `SCORED` jobs into trustworthy, job-specific resumes by tailoring the **structured master resume** (from Phase 01.1) into a structured tailored resume, enforcing integrity via the deterministic structured-vs-structured validator, rendering to PDF through the HTML→PDF pipeline, recording the outputs as `Artifacts`, and transitioning the job to `TAILORED`.
**Depends on**: Phase 3, Phase 01.1 (structured-resume substrate: master schema/loader, HTML→PDF renderer, structured integrity validator, Artifacts table)
**Requirements**: RESUME-01, RESUME-02, RESUME-03, RESUME-04, RESUME-05
**Success Criteria** (what must be TRUE):
  1. The resume agent runs only for jobs at/above the configured match-score threshold and, given the **structured master resume + job description**, produces a **structured tailored resume** (same schema) that reorders skills, rewrites the summary, emphasizes relevant experience, and optimizes keywords — operating on structured data, never on PDF text
  2. The structured tailored resume passes the Phase 01.1 deterministic structured-vs-structured integrity validator before rendering — any company/technology/project/claim absent from the master is rejected mechanically, not by prompt wording alone
  3. The validated tailored resume renders via the HTML→PDF pipeline to `Resume_CompanyName.pdf` (selectable-text, single-column, ATS-readable; PDF is output-only), and both the structured tailored resume and the rendered PDF are recorded as `Artifacts` linked to the job/application as it transitions to `TAILORED`
**Plans**: TBD

### Phase 5: Scheduler & Hardening
**Goal**: Make the proven agents run as an autonomous platform — each independently invokable from a CLI, scheduled on configured intervals, protected from overlap, observable via structured logs, and self-healing across missed runs.
**Depends on**: Phase 4
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05
**Success Criteria** (what must be TRUE):
  1. Each agent is independently executable from its own CLI entrypoint, and a scheduler runs agents on configured intervals (croner / system cron / Codex Scheduled Tasks invoking the CLI)
  2. An overlap guard prevents a new scheduled run from starting while the previous run is still active, and runs are recorded with structured logs while a per-agent error is logged without crashing the whole pipeline
  3. Missed runs self-heal — discovery and matching catch up by querying DB state rather than depending on having run on time, so the discovery → matching → resume loop completes autonomously end-to-end
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 1.1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | 5/5 | Complete | 2026-06-29 |
| 1.1 Observability, Auditability & Resume SoT (INSERTED) | 0/TBD | Not started | - |
| 2. Job Discovery | 0/TBD | Not started | - |
| 3. Matching | 0/TBD | Not started | - |
| 4. Resume Customization | 0/TBD | Not started | - |
| 5. Scheduler & Hardening | 0/TBD | Not started | - |
