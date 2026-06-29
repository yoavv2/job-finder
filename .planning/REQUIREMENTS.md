# Requirements: Autonomous Job Application Agent

**Defined:** 2026-06-29
**Core Value:** Reduce manual job-search work by 90%+ while maintaining high application quality — the discovery → matching → resume-tailoring loop runs autonomously and produces trustworthy, job-specific resumes.

## v1 Requirements

v1 = the core pipeline: Foundations, Discovery, Matching, Resume Customization, and the Scheduler that ties them together. Each agent communicates only through the SQLite database and is independently runnable.

### Foundation

- [x] **FND-01**: All settings load from a YAML config file (schedule, filters, keywords, countries, `minimumMatchScore`, `llm.provider`) — no hardcoded values
- [x] **FND-02**: Config is validated against a Zod schema on load; invalid config fails fast with a clear error
- [x] **FND-03**: Secrets (LLM API keys) load from environment / `.env`; `.env` is gitignored and never committed
- [x] **FND-04**: SQLite database is created and migrated via the ORM (Drizzle + better-sqlite3) with `Companies`, `Jobs`, and `Applications` tables
- [x] **FND-05**: Database opens in WAL mode with a `busy_timeout` so scheduled/overlapping runs don't corrupt or deadlock
- [x] **FND-06**: A repository/data-access layer wraps all DB reads/writes (no raw SQL in agents) so the DB is swappable
- [x] **FND-07**: A unified `Agent` interface exists (`name`, `run(ctx): Promise<AgentResult>`) and agents are registered in a plugin registry — new agents add without modifying existing ones
- [x] **FND-08**: A job-status state machine is defined (`NEW → SCORING → SCORED → TAILORING → TAILORED`, plus `REJECTED_LOW_SCORE` / `ERROR`); agents claim rows atomically by status

### LLM Provider

- [x] **LLM-01**: A provider-agnostic `LLMProvider` interface defines the operations agents need (e.g. `scoreJob`, `tailorResume`)
- [x] **LLM-02**: At least two concrete providers implement the interface (e.g. OpenAI + Claude), selected via `llm.provider` config without code changes
- [x] **LLM-03**: Structured LLM outputs are schema-validated (Zod) so malformed responses are caught, not silently used
- [x] **LLM-04**: Job-description text is treated as untrusted input — sanitized/delimited before being sent to the LLM to resist prompt injection

### Companies

- [x] **COMP-01**: A `Company` entity/table exists (`id, name, ats, boardToken, careersUrl, website, firstSeenAt, lastSeenAt, active`) — an accumulating knowledge base, not a config file
- [ ] **COMP-02**: v1 bootstraps companies from a seed (config/seed file) — explicitly a temporary bootstrap, designed so an automated Company Discovery agent can later populate the same table without changing Job Discovery
- [ ] **COMP-03**: Syncing jobs for a company updates its `lastSeenAt`; a company referenced by a job but not yet recorded is upserted (sets `firstSeenAt`) so the Companies KB stays current automatically

### Observability — Agent Run History

- [x] **OBS-01**: An `AgentRuns` table records one row per agent execution (`id, agent, startedAt, finishedAt, status, processed, succeeded, failed, durationMs, tokens, estimatedCost, error, metadata`)
- [ ] **OBS-02**: Run records are emitted **centrally by the framework** that invokes `Agent.run(ctx)` — agents never create their own — managing the STARTED→RUNNING→SUCCESS/FAILED lifecycle automatically, finalizing as FAILED with the error captured even when `run` throws
- [ ] **OBS-03**: Token usage and estimated cost accrued through the `LLMProvider` during a run are aggregated onto the run record (`tokens`, `estimatedCost`) to support cost and performance analysis

### Audit — Event Log

- [x] **EVT-01**: A `JobEvents` table exists (`id, jobId, agent, event, payload, createdAt`) as an **append-only** audit trail — events are never updated or deleted
- [ ] **EVT-02**: Important job transitions emit an immutable event (e.g. `JOB_DISCOVERED`, `MATCH_STARTED`, `MATCH_COMPLETED`, `MATCH_REJECTED`, `TAILOR_STARTED`, `TAILOR_COMPLETED`, `ERROR`); `Job.status` remains the current-state field while `JobEvents` is the history — history is never overwritten
- [ ] **EVT-03**: Events are written and read through the repository layer (no raw SQL) and are queryable by `jobId` to reconstruct a job's full history

### Artifacts

- [x] **ART-01**: A generic `Artifacts` table exists (`id, jobId, type, path, mimeType, metadata, createdAt`) supporting arbitrary artifact types (`resume_pdf`, `resume_html`, `resume_json`, `cover_letter`, `llm_response`, `analysis`, `screenshot`) **without schema changes** for new types
- [ ] **ART-02**: Jobs reference artifacts via the `Artifacts` table rather than per-type path columns on the Job row, so new artifact types require no migration
- [ ] **ART-03**: Artifact creation and lookup go through the repository layer (an `ArtifactRepository`) with helpers to list a job's artifacts by job and by type

### Resume Source of Truth

- [ ] **RES-01**: The resume exists as Zod-validated **structured data** (`resume/master.yaml`) covering Profile, Summary, Skills, Experience, Projects, Education, Certificates, Languages; PDFs are outputs only and are **never parsed as input**
- [ ] **RES-02**: A renderer turns a structured resume into an ATS-readable, single-column, selectable-text PDF via an HTML stage (`structured resume → HTML → PDF`), as reusable output stages
- [ ] **RES-03**: A deterministic integrity validator compares **structured master vs structured tailored** (entity-diff over the typed model) and rejects any output introducing a company, technology, project, or claim absent from the master — the reusable mechanism Phase 4 enforces, with no PDF parsing involved

### Job Discovery

- [ ] **DISC-01**: Job Discovery reads `active` companies that have a known `ats` + `boardToken` and syncs their published jobs — decoupled from how those companies were discovered
- [ ] **DISC-02**: A Collector dispatches each company to the correct per-ATS Adapter based on its `ats` field (Collector + Adapter pattern)
- [ ] **DISC-03**: Greenhouse adapter retrieves and normalizes a company's jobs into the common `Jobs` shape via the ATS public JSON API
- [ ] **DISC-04**: Lever, Ashby, and Workable adapters each retrieve and normalize jobs (added additively, one file each)
- [ ] **DISC-05**: New jobs are deduplicated on a stable identity key (`ats`/source + external job id) so re-runs don't create duplicates
- [ ] **DISC-06**: Jobs are filtered by configured keywords, location/country, and seniority before storage
- [ ] **DISC-07**: Newly discovered jobs are stored with `status = NEW`, linked to their `Company`, with discovery metadata (source, url, postedDate, discoveredAt)
- [ ] **DISC-08**: Discovery paces requests politely (backoff/retry) and survives a single company/source failing without aborting the run

### Matching

- [ ] **MATCH-01**: Matching agent reads every `NEW` job and scores it 0–100 against the resume/skills/experience
- [ ] **MATCH-02**: A cheap keyword pre-filter runs before the LLM call to avoid scoring obviously-irrelevant jobs
- [ ] **MATCH-03**: Scoring output is structured: `{ score, strengths[], missingSkills[], recommendation }`, persisted to the job row
- [ ] **MATCH-04**: Each job is scored once and the result persisted (idempotent) so daily runs don't re-spend tokens
- [ ] **MATCH-05**: Jobs scoring below `minimumMatchScore` are marked `REJECTED_LOW_SCORE`; those at/above advance to `SCORED`

### Resume Customization

- [ ] **RESUME-01**: Resume agent runs only for jobs at/above the configured match-score threshold
- [ ] **RESUME-02**: Given the **structured master resume** (RES-01) + job description, it produces a **structured tailored resume** of the same schema (reorder skills, rewrite summary, emphasize relevant experience, optimize keywords) — operating on structured data, never on PDF text
- [ ] **RESUME-03**: The structured tailored resume passes the deterministic structured-vs-structured integrity validator (RES-03) before rendering — any company, technology, project, or claim absent from the master is rejected mechanically, not just by prompt wording
- [ ] **RESUME-04**: The validated tailored resume is rendered via the HTML→PDF pipeline (RES-02) to `Resume_CompanyName.pdf` with selectable text (ATS-readable, single-column); the PDF is output-only
- [ ] **RESUME-05**: The structured tailored resume and the rendered PDF are recorded as `Artifacts` (ART-01) linked to the job/application, and the job transitions to `TAILORED`

### Scheduler & Operability

- [ ] **SCHED-01**: Each agent is independently executable from a CLI entrypoint (e.g. one subcommand per agent)
- [ ] **SCHED-02**: A scheduler runs agents on configured intervals (croner / system cron / Codex Scheduled Tasks invoking the CLI)
- [ ] **SCHED-03**: An overlap guard prevents a new scheduled run from starting while the previous one is still active
- [ ] **SCHED-04**: Runs are logged (structured logs) and per-agent errors are recorded without crashing the whole pipeline
- [ ] **SCHED-05**: Missed runs self-heal — discovery/matching catch up by querying DB state rather than relying on having run on time

## v2 Requirements

Deferred to future release. Tracked, not in current roadmap.

### Cover Letter

- **COVER-01**: Generate `CoverLetter_Company.pdf` or plain text when needed

### Application (Auto-Apply)

- **APPLY-01**: Open application pages with Playwright, fill contact info, upload resume + cover letter
- **APPLY-02**: Stop at `READY_FOR_SUBMIT` — capture screenshot + resume + match score, require one human click; never auto-submit
- **APPLY-03**: Mark complex/ambiguous applications `Needs Human`; never auto-answer screening questions without explicit config

### Email Monitoring

- **EMAIL-01**: Read Gmail hourly, classify messages (interview / assessment / rejection / offer / recruiter), update application status

### Reporting

- **REPORT-01**: Weekly report (jobs found, applications submitted, interviews, rejections, response rate, avg match score, top companies, most-requested skills)

### Company Discovery

- **CDISC-01**: A Company Discovery agent finds previously-unknown companies from external sources (aggregators, YC, Product Hunt, RSS, startup DBs), detects their ATS, and extracts the board token → creates/updates `Company` records (replaces manual seeding, no Job Discovery changes)

### Company Enrichment

- **ENRICH-01**: A Company Intelligence agent enriches `Company` records (industry, stage, employee count, HQ, funding, remote policy, tech stack, Glassdoor rating, notes), independent of discovery

### Curation

- **CURATE-01**: A curation layer combines signals (match score, company quality, stage, salary, remote-friendliness, tech stack, growth) into a priority ranking (HIGH/MED/LOW) per opportunity

### Sources

- **SRC-01**: LinkedIn source via authenticated Playwright session
- **SRC-02**: Company career-page adapters

## Out of Scope

Explicitly excluded for v1. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| LinkedIn in v1 | Login + anti-bot + CAPTCHA + constant DOM changes + ToS risk; add after ATS pipeline is robust |
| Playwright DOM scraping for discovery | All four ATS boards expose public JSON APIs — `fetch` is simpler, stable, and avoids bot detection |
| Auto-submitting applications | Hard safety rule — human approves the final click; prevents sending wrong resumes |
| Auto-answering screening questions | Hallucination risk; requires explicit per-question config (v2+) |
| Fabricating resume content | Cardinal sin — reorder/rewrite/emphasize only, enforced by the entity-diff validator |
| CSV / Google Sheets / Airtable storage | SQLite from day one; ORM keeps future DB swap near-transparent |
| n8n / Make / low-code orchestrators | Everything is code |
| Future agents (networking, recruiter follow-up, salary, interview prep, portfolio, A/B, market trends) | Architecture supports them; not built in v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 1 | Complete |
| FND-05 | Phase 1 | Complete |
| FND-06 | Phase 1 | Complete |
| FND-07 | Phase 1 | Complete |
| FND-08 | Phase 1 | Complete |
| LLM-01 | Phase 1 | Complete |
| LLM-02 | Phase 1 | Complete |
| LLM-03 | Phase 1 | Complete |
| LLM-04 | Phase 1 | Complete |
| COMP-01 | Phase 1 | Complete |
| OBS-01 | Phase 1.1 | Complete |
| OBS-02 | Phase 1.1 | Pending |
| OBS-03 | Phase 1.1 | Pending |
| EVT-01 | Phase 1.1 | Complete |
| EVT-02 | Phase 1.1 | Pending |
| EVT-03 | Phase 1.1 | Pending |
| ART-01 | Phase 1.1 | Complete |
| ART-02 | Phase 1.1 | Pending |
| ART-03 | Phase 1.1 | Pending |
| RES-01 | Phase 1.1 | Pending |
| RES-02 | Phase 1.1 | Pending |
| RES-03 | Phase 1.1 | Pending |
| COMP-02 | Phase 2 | Pending |
| COMP-03 | Phase 2 | Pending |
| DISC-01 | Phase 2 | Pending |
| DISC-02 | Phase 2 | Pending |
| DISC-03 | Phase 2 | Pending |
| DISC-04 | Phase 2 | Pending |
| DISC-05 | Phase 2 | Pending |
| DISC-06 | Phase 2 | Pending |
| DISC-07 | Phase 2 | Pending |
| DISC-08 | Phase 2 | Pending |
| MATCH-01 | Phase 3 | Pending |
| MATCH-02 | Phase 3 | Pending |
| MATCH-03 | Phase 3 | Pending |
| MATCH-04 | Phase 3 | Pending |
| MATCH-05 | Phase 3 | Pending |
| RESUME-01 | Phase 4 | Pending |
| RESUME-02 | Phase 4 | Pending |
| RESUME-03 | Phase 4 | Pending |
| RESUME-04 | Phase 4 | Pending |
| RESUME-05 | Phase 4 | Pending |
| SCHED-01 | Phase 5 | Pending |
| SCHED-02 | Phase 5 | Pending |
| SCHED-03 | Phase 5 | Pending |
| SCHED-04 | Phase 5 | Pending |
| SCHED-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 50 total (38 original + 12 from Phase 1.1 insertion)
- Mapped to phases: 50 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-29*
*Last updated: 2026-06-29 — inserted Phase 1.1 (Observability/Audit/Artifacts/Resume-SoT: OBS/EVT/ART/RES) and rewrote Phase 4 RESUME reqs to build on the structured-resume substrate*
