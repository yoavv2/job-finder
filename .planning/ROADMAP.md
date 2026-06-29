# Roadmap: Autonomous Job Application Agent

## Overview

This roadmap builds a plugin-based multi-agent job-application pipeline from the persistence seam outward. Phase 1 lays the entire foundation — typed config, the SQLite/Drizzle schema and repository layer, the WAL-mode atomic-claim choreography, the `Agent` interface + registry, the status state machine, and the provider-agnostic `LLMProvider` interface with two concrete implementations — because every agent above depends on it. Phases 2–4 then add the three pipeline agents in dependency order (Discovery produces `NEW` jobs, Matching scores them into `SCORED`/`REJECTED_LOW_SCORE`, Resume tailors eligible jobs into `TAILORED` PDFs), each communicating only through the database. Phase 5 ties the independently-runnable agents together under a scheduler with an overlap guard, structured logging, and missed-run self-heal — turning a set of proven agents into an autonomous platform.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundations** - Config, persistence seam, agent/registry/state-machine contracts, and the provider-agnostic LLM layer that everything depends on
- [ ] **Phase 2: Discovery** - Discovery agent fetches, normalizes, dedupes, and filters ATS jobs into `NEW` rows via a Collector + per-ATS adapters
- [ ] **Phase 3: Matching** - Matching agent scores every `NEW` job against the resume and branches to `SCORED` or `REJECTED_LOW_SCORE`
- [ ] **Phase 4: Resume Customization** - Resume agent tailors eligible jobs into integrity-validated `Resume_Company.pdf` files and marks them `TAILORED`
- [ ] **Phase 5: Scheduler & Hardening** - CLI entrypoints + scheduler with overlap guard, structured logging, and missed-run self-heal that runs the whole loop autonomously

## Phase Details

### Phase 1: Foundations
**Goal**: Stand up the typed, durable substrate every agent runs on — configuration, persistence, the agent contract + status choreography, and a provider-agnostic LLM layer — so that no agent has to invent infrastructure.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, LLM-01, LLM-02, LLM-03, LLM-04
**Success Criteria** (what must be TRUE):
  1. The app loads all settings from a YAML config validated by a Zod schema, fails fast with a clear error on invalid config, and reads LLM API keys from a gitignored `.env` — no hardcoded values anywhere
  2. A migrated SQLite database opens in WAL mode with a `busy_timeout` and exposes `Jobs` and `Applications` tables exclusively through a repository layer (no raw SQL outside it), including an atomic status-claim/transition helper proven not to double-process under overlap
  3. A unified `Agent` interface (`name`, `run(ctx)`) and a registry exist such that registering a new agent requires no change to existing agents, and the job-status state machine (`NEW → SCORING → SCORED → TAILORING → TAILORED`, plus `REJECTED_LOW_SCORE` / `ERROR`) is enforced for transitions
  4. A provider-agnostic `LLMProvider` interface with at least two concrete implementations (e.g. OpenAI + Claude) is selectable purely via `llm.provider` config, returns Zod-schema-validated structured output, and delimits/sanitizes job-description text as untrusted input
**Plans**: TBD

### Phase 2: Discovery
**Goal**: Produce trustworthy `NEW` job rows by fetching from ATS public JSON APIs through a Collector + per-ATS adapter pattern, deduping and filtering before storage, and surviving individual source failures.
**Depends on**: Phase 1
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07
**Success Criteria** (what must be TRUE):
  1. Running the discovery agent fetches published jobs from ATS public JSON APIs via a Collector and adds a new ATS source as a single additive adapter file, with Greenhouse working first and Lever/Ashby/Workable each retrieving and normalizing into the common `Jobs` shape
  2. Discovered jobs are deduplicated on a stable identity key (`source` + external id) so re-runs create no duplicates, and are stored with `status = NEW` plus discovery metadata (source, url, postedDate, discoveredAt)
  3. Jobs are filtered by configured keywords, location/country, and seniority before storage, so irrelevant roles never enter the pipeline
  4. Discovery paces requests politely with backoff/retry and a single failing source does not abort the whole run
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
**Goal**: Turn eligible `SCORED` jobs into trustworthy, job-specific resume PDFs — tailoring content within strict integrity rules enforced mechanically — and record the artifact path while transitioning the job to `TAILORED`.
**Depends on**: Phase 3
**Requirements**: RESUME-01, RESUME-02, RESUME-03, RESUME-04, RESUME-05
**Success Criteria** (what must be TRUE):
  1. The resume agent runs only for jobs at/above the configured match-score threshold and, given the base resume + job description, produces a tailored resume that reorders skills, rewrites the summary, emphasizes relevant experience, and optimizes keywords
  2. A deterministic integrity validator (entity-diff against the base resume) mechanically rejects any output introducing a company, technology, project, or claim absent from the base resume — fabrication is blocked by code, not prompt wording alone
  3. The tailored resume renders to `Resume_CompanyName.pdf` as selectable-text, single-column, ATS-readable output, and the PDF path is stored on the job/application row as the job transitions to `TAILORED`
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
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | 0/TBD | Not started | - |
| 2. Discovery | 0/TBD | Not started | - |
| 3. Matching | 0/TBD | Not started | - |
| 4. Resume Customization | 0/TBD | Not started | - |
| 5. Scheduler & Hardening | 0/TBD | Not started | - |
