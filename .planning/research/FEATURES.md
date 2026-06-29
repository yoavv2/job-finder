# Feature Research

**Domain:** Autonomous job-application agent (discovery → match scoring → resume tailoring)
**Researched:** 2026-06-29
**Confidence:** HIGH (ecosystem patterns well-established across Jobscan, Teal, Huntr, LoopCV, AIApply, and ATS public-API tooling; LLM scoring rubrics corroborated by multiple sources incl. arXiv)

## Feature Landscape

This is a single-user, self-hosted automation system, not a SaaS. "Users expect" means "the owner-operator needs this for the pipeline to be trustworthy and useful." Table stakes are scoped to the **v1 core loop**: discovery → matching → resume tailoring, plus the DB/config substrate the loop runs on.

### Table Stakes (Required for v1 to be Useful)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **ATS discovery via public JSON APIs** | Greenhouse, Lever, Ashby, Workable expose published jobs over public JSON endpoints (no OAuth, no login). This is the source of all jobs. | **LOW–MEDIUM** | KEY FINDING: Greenhouse `GET api.greenhouse.io/v1/boards/{co}/jobs?content=true`, Lever `GET api.lever.co/v0/postings/{co}?mode=json`, Ashby public feed (`includeCompensation=true`). Playwright is **NOT needed for discovery** — HTTP+JSON per ATS adapter is simpler, faster, and stable. Reserve Playwright for v2 auto-apply. One `Collector` + `Adapter`-per-ATS, normalizing to a uniform schema. |
| **Per-job deduplication** | Boards are polled repeatedly (daily/weekly). Without dedup, every run re-creates the same jobs and re-spends LLM tokens scoring them. | **LOW** | Stable identity key: `(ats_source, external_job_id)` or hash of `apply_url`. Cross-run dedup on insert. Jobs already in DB are skipped. This is what makes "detect NEW jobs" meaningful. |
| **Keyword / location / seniority filtering** | Owner targets Frontend/React/Next/TS, Junior–Mid, Remote + Israel. Filtering avoids scoring thousands of irrelevant roles (cost + noise). | **LOW** | Cheap deterministic pre-filter BEFORE the LLM match step — title/keyword include-lists, location allow-list, seniority heuristics. All YAML-driven. Saves the expensive LLM call for plausible matches only. |
| **Match scoring 0–100 vs resume** | The core value proposition — turning a raw job list into a ranked, decision-ready queue. | **MEDIUM** | See "Match scoring rubric" below. LLM-based semantic match (not raw keyword %) is current best practice. Output is a structured object, not just a number. |
| **Structured match output (strengths / missing skills / recommendation)** | A bare score is not actionable. The owner needs *why*. Industry analyzers always pair score with gap analysis. | **MEDIUM** | Standard rubric: must-have skills met/unmet, good-to-have skills, strengths summary, missing/underrepresented skills, qualitative fit (high/med/low), and an APPLY / MAYBE / SKIP recommendation. Persist the full breakdown. |
| **Configurable minimum-match threshold** | Gates which jobs proceed to expensive resume tailoring. The dial that controls volume vs quality. | **LOW** | `minimumMatchScore` in YAML. Only jobs `>= threshold` enter the resume-customization stage. Prevents wasting LLM tokens tailoring resumes for poor fits. |
| **Truthful resume tailoring** | Per-job resume that *reorders skills, rewrites summary, emphasizes relevant experience, optimizes keywords* — never invents. | **HIGH** | The integrity-constrained core. See "Resume integrity" below. Hardest correctness problem in v1 because the failure mode (fabrication) is silent and damaging. Requires structured resume input + constrained prompts + validation. |
| **PDF resume output + deterministic naming** | Output must be a real, ATS-parseable PDF the owner can submit, named per job. | **MEDIUM** | `Resume_{Company}.pdf` (sanitize company name for filesystem safety; collision handling, e.g. `Resume_{Company}_{jobId}.pdf`). PDF must be ATS-friendly: single-column, no tables/text-boxes/header-footer-trapped contact info, selectable text — multi-column/table layouts collapse ATS parse scores. |
| **Job + Application status lifecycle** | The system runs unattended; status is how stages hand off work and how the owner sees progress. | **LOW–MEDIUM** | Job states drive the pipeline: `NEW → SCORED → (TAILORED \| SKIPPED)`. Application lifecycle (forward-looking, even if v1 stops early): `READY_FOR_SUBMIT → SUBMITTED → INTERVIEW → OFFER → REJECTED`. Standard tracker stages (Saved/Applied/Interview/Offer/Rejected) confirm the vocabulary. Agents communicate ONLY via these DB states. |
| **SQLite persistence (Jobs + Applications)** | Single source of truth; the only inter-agent communication channel. | **LOW–MEDIUM** | Via Drizzle/Prisma. Jobs table (discovery + scoring fields), Applications table (lifecycle + artifacts: resume path, score snapshot). ORM keeps a future DB swap near-transparent. |
| **YAML-driven configuration** | "No hardcoded values" is a hard project constraint. | **LOW** | Schedule, ATS company lists, keyword/location/seniority filters, `minimumMatchScore`, `llm.provider`. Validate config on load (fail fast on bad config). |
| **Scheduled / on-interval execution** | The whole point is autonomy — runs daily/weekly without a human kicking it off. | **LOW** | cron or Codex Scheduled Tasks invoking each independently-runnable agent. No managed workflow engine. |
| **Idempotent, independently-runnable agents** | Re-running discovery or scoring must not duplicate or corrupt state. Each agent runnable in isolation for testing/debugging. | **MEDIUM** | Idempotency falls out of dedup + status guards (only act on jobs in the expected state). Critical for an unattended scheduled system. |

### Differentiators (Competitive Advantage vs. Off-the-Shelf Tools)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Integrity-first tailoring (hard guarantee, not a feature toggle)** | Most consumer tools (AIApply, CVnomist, "auto-apply" tools) optimize for volume and will happily inflate. A system that *provably* never fabricates produces resumes the owner can defend in an interview. | **HIGH** | Differentiator only if enforced: constrain the LLM to a fixed inventory of real skills/experiences and validate output against that inventory (reject any claim not traceable to the source resume). This is the project's signature trait. |
| **Provider-agnostic LLM (OpenAI/Claude/Gemini via config)** | Swap models for cost/quality/availability without touching pipeline code; A/B model quality on scoring. | **MEDIUM** | `LLMProvider` interface. Differentiator vs. tools locked to one model. |
| **Plugin agent architecture (extensible platform)** | Long-term platform: add Cover Letter, Application, Email, Reporting agents later without modifying existing ones. | **MEDIUM** | Unified `Agent` interface (`run(ctx): Promise<AgentResult>`). Pays off in v2+. |
| **Explainable, persisted scoring history** | Every score keeps its full rationale and skill-gap breakdown in the DB — auditable, and a dataset for tuning the rubric over time. | **LOW** (given structured output already exists) | Off-the-shelf tools show a transient score; persisting the reasoning enables threshold tuning and later analytics. |
| **Self-hosted, owner-controlled data** | No resume/job data leaving to a third-party SaaS (except chosen LLM API). Full control of pipeline logic and prompts. | LOW (inherent to design) | Inherent differentiator of the build-it-yourself approach. |
| **Multi-ATS unified schema** | One normalized job model across Greenhouse/Lever/Ashby/Workable; add an adapter to gain a board. | **MEDIUM** | The adapter pattern is the moat for expanding coverage cheaply. |

### Anti-Features (Deliberately NOT Built)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Fabricating experience / skills / metrics** | "Higher match score → more interviews." | Destroys trust, indefensible in interviews, fraudulent hire risk; modern ATS + recruiters increasingly detect AI-fabricated resumes (prompt-scrubbing, re-rendering, pattern detection). The entire value prop collapses. | Hard guarantee: reorder/rewrite/emphasize/keyword-optimize **only**, against a fixed inventory of real experience. Validate output. |
| **Keyword stuffing / hidden white-text keywords** | Inflate ATS keyword-match %. | Modern ATS flags unnatural keyword density; ~41% of stuffers do it and it's increasingly detected and penalized. Hidden-text tricks get stripped during re-rendering. | Weave 1–2 *real* relevant keywords naturally per bullet — proven to outperform stuffing. |
| **Fully autonomous submit (no human review)** | "True end-to-end automation." | One wrong resume/score sent is unrecoverable and reputation-damaging; auto-apply is also the most fragile (DOM/anti-bot) piece. | v2 stops at `READY_FOR_SUBMIT`: capture screenshot + resume + score, require one human click. Never auto-submit. |
| **Auto-answering screening questions** | Save clicks on application forms. | Often legal/eligibility attestations (visa, salary, start date) — wrong answers are misrepresentation; high-variance per form. | Surface questions for human answer; only auto-fill from explicit, owner-provided config values. |
| **LinkedIn as a v1 source** | Largest job volume. | Login walls, constant DOM churn, anti-bot/CAPTCHA, ToS/legal risk — fragile and high-maintenance. | ATS public JSON APIs first (stable, no auth). LinkedIn only after core is robust (v2+). |
| **Generic company career-page scraping** | Broader coverage. | Heterogeneous DOM per company → unbounded maintenance. | Stick to the 4 structurally-similar ATS providers in v1. |
| **CSV / Google Sheets / Airtable storage** | Easy to eyeball, "no DB needed." | No transactions/dedup guarantees, poor concurrency, not a real inter-agent channel; explicitly rejected in PROJECT.md. | SQLite + ORM from day one. |
| **Low-code orchestrator (n8n / Make)** | Faster to wire agents. | Opaque, hard to test/version, fragile — contradicts "everything is code, production-grade platform." | Code-based scheduler (cron / Codex Scheduled Tasks) + plugin agents. |
| **Mass "apply to everything" / high-volume spray** | More applications = more interviews (marketed by auto-apply tools). | Low-fit spam wastes the owner's reputation and recruiter goodwill; burns LLM tokens; defeats the quality goal. | Threshold-gated, quality-first pipeline (`minimumMatchScore`). |
| **Cover Letter / Email-monitoring / Reporting agents in v1** | Round out the product. | Scope creep; email is auth-heavy/fragile; keep v1 tight to ship the core loop. | Architecture supports them; defer to v2 per PROJECT.md. |

## Match Scoring Rubric (How Good Systems Score 0–100)

Current best practice (corroborated by LLM-analyzer guides and arXiv multi-agent screening work) is **LLM semantic matching**, not raw keyword overlap. A defensible rubric:

1. **Must-have / hard requirements** (heaviest weight, ~40–50%): explicit required skills & core responsibilities present in the resume. Semantic match — "ML" counts for "machine learning", "project coordination" relates to "project management".
2. **Good-to-have / preferred skills** (moderate weight): nice-to-haves met.
3. **Seniority & scope fit**: junior–mid alignment, project difficulty, ownership/leadership signals.
4. **Location / remote eligibility**: usually a deterministic gate (often pre-filtered before scoring).
5. **Qualitative overall fit**: high / medium / low.

Output a **structured object**, e.g.:
```
{ score: 0-100, mustHaveMet: [...], mustHaveMissing: [...],
  strengths: [...], missingSkills: [...], fit: "high|medium|low",
  recommendation: "APPLY|MAYBE|SKIP", rationale: "..." }
```
Reference thresholds from ATS tooling: keyword-match "good" is ~60%+, "strong" ~75%+, aim for ~80% of *required* + ~50% of *preferred* keywords. These inform a sensible default `minimumMatchScore` (suggest ~70) — but it MUST stay YAML-configurable.

## Resume Integrity (The Hard Boundary)

| Allowed (tailoring) | Forbidden (fabrication) |
|---------------------|--------------------------|
| Reorder skills to surface relevant ones | Invent skills/technologies not in source resume |
| Rewrite the summary for the role | Fabricate projects, employers, titles |
| Emphasize relevant real experience | Inflate dates, metrics, scope |
| Map real experience to the posting's exact terms | Keyword-stuff / hidden text |

Enforce mechanically: feed the LLM a **fixed inventory** of the owner's real skills/experiences, instruct transformation-only, then **validate** the generated resume — every skill/claim must trace back to the inventory; reject or flag anything that doesn't. Treat this as a correctness requirement with tests, not just prompt wording.

## Feature Dependencies

```
ATS Discovery (public JSON adapters)
    └──requires──> Per-job Deduplication ──requires──> SQLite + ORM (Jobs table)
                                                            │
Keyword/Location/Seniority Pre-filter ──gates──────────────┤
                                                            ▼
Match Scoring (LLM) ──requires──> LLMProvider interface ──requires──> YAML config (provider)
    │                                                       
    └──produces──> Structured score (strengths/missing/recommendation) ──persisted──> SQLite
                        │
minimumMatchScore (YAML) ──gates──▼
                        Resume Tailoring (integrity-constrained)
                            └──requires──> Structured resume inventory (source of truth)
                            └──produces──> PDF output (Resume_Company.pdf)
                                                └──recorded in──> Applications table (status, artifact path)

Scheduler ──drives──> all agents (each idempotent, status-guarded)
Plugin Agent interface ──enables──> v2 agents without touching v1
Job/Application status lifecycle ──is the inter-agent communication channel (no direct calls)
```

### Dependency Notes

- **Discovery requires Dedup requires DB:** dedup needs a persisted identity key; "detect NEW jobs" is meaningless without stored prior state.
- **Pre-filter gates Scoring:** deterministic filtering before the LLM call is what keeps token cost and noise down — order matters in the roadmap.
- **Scoring requires LLMProvider + config:** scoring is the first consumer of the provider abstraction; build the interface alongside it.
- **Threshold gates Tailoring:** resume customization only runs for jobs above `minimumMatchScore` — Scoring must complete and persist before Tailoring can select work.
- **Tailoring requires a structured resume inventory:** integrity validation is impossible without a machine-checkable source of truth for what's "real".
- **Status lifecycle underpins everything:** agents are decoupled via DB states; the lifecycle must be designed early or agents can't hand off.
- **Plugin interface enhances all agents:** defining `Agent.run(ctx)` early makes every v1 agent a clean template for v2.

## MVP Definition

### Launch With (v1 core loop)

- [ ] **ATS discovery via public JSON adapters** (Greenhouse, Lever, Ashby, Workable) — source of all jobs; HTTP+JSON, no Playwright
- [ ] **Per-job dedup + SQLite (Jobs/Applications) via ORM** — substrate the whole pipeline stands on
- [ ] **YAML config + validation** — hard constraint; gates filters/threshold/provider
- [ ] **Keyword/location/seniority pre-filter** — keeps scoring cheap and relevant
- [ ] **LLM match scoring (structured output) behind `LLMProvider`** — the core value, with strengths/missing/recommendation
- [ ] **`minimumMatchScore` threshold gate** — controls quality vs volume
- [ ] **Integrity-constrained resume tailoring** — the signature trait; validate against real inventory
- [ ] **ATS-friendly PDF output, `Resume_Company.pdf` naming** — the deliverable
- [ ] **Job/Application status lifecycle** — inter-agent channel + visibility
- [ ] **Scheduler + idempotent, independently-runnable plugin agents** — makes it autonomous

### Add After Validation (v1.x)

- [ ] **Score-rubric tuning from persisted history** — trigger: enough scored jobs to see false APPLY/SKIP rates
- [ ] **More ATS adapters (SmartRecruiters, Workday)** — trigger: owner runs out of target companies on the 4 core boards
- [ ] **Run/summary logging or lightweight digest** — trigger: hard to tell what each scheduled run did

### Future Consideration (v2+)

- [ ] **Application Agent (Playwright)** — stops at `READY_FOR_SUBMIT`, screenshot + resume + score, one human click; never auto-submit. Defer: most fragile piece, build on stable base.
- [ ] **Email Monitoring Agent (Gmail)** — defer: auth-heavy and fragile.
- [ ] **Cover Letter Agent** — defer: close to resume agent, kept out to ship v1 tight.
- [ ] **Weekly Reporting Agent** — defer: nice-to-have analytics.
- [ ] **LinkedIn / company career pages** — defer: anti-bot, DOM churn, ToS, heterogeneity.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| ATS discovery (public JSON adapters) | HIGH | MEDIUM | P1 |
| Dedup + SQLite/ORM | HIGH | MEDIUM | P1 |
| YAML config + validation | HIGH | LOW | P1 |
| Keyword/location/seniority pre-filter | HIGH | LOW | P1 |
| LLM match scoring (structured) | HIGH | MEDIUM | P1 |
| `minimumMatchScore` threshold | HIGH | LOW | P1 |
| Integrity-constrained resume tailoring | HIGH | HIGH | P1 |
| ATS-friendly PDF + naming | HIGH | MEDIUM | P1 |
| Status lifecycle | HIGH | LOW–MED | P1 |
| Scheduler + plugin agents | HIGH | MEDIUM | P1 |
| Provider-agnostic LLM interface | MEDIUM | MEDIUM | P1 (built alongside scoring) |
| Persisted scoring history/explainability | MEDIUM | LOW | P2 |
| Additional ATS adapters | MEDIUM | MEDIUM | P2 |
| Run/summary logging | MEDIUM | LOW | P2 |
| Application Agent (auto-fill, human submit) | HIGH | HIGH | P3 (v2) |
| Email monitoring / Cover letter / Reporting | MEDIUM | MEDIUM–HIGH | P3 (v2) |

**Priority key:** P1 = must have for v1 launch · P2 = add after validation · P3 = v2+ defer

## Competitor Feature Analysis

| Feature | Jobscan / Teal / Huntr | AIApply / auto-apply tools | Our Approach |
|---------|------------------------|----------------------------|--------------|
| Job discovery | Browser-extension bookmarking from 50+ boards (manual-ish) | Crawl LinkedIn/Indeed/company sites, mass-apply | Automated pull from ATS **public JSON APIs**, deduped, unattended |
| Match scoring | Keyword-match % + section/format checks; transient | Implicit, optimized for apply-rate | LLM **semantic** 0–100 with persisted strengths/missing/recommendation |
| Resume tailoring | Keyword suggestions, user edits | Auto-rewrite per role, volume-first (fabrication risk) | **Integrity-constrained** rewrite validated against real inventory |
| Submission | Manual (tracker only) | **Fully autonomous submit** | v2: stop at `READY_FOR_SUBMIT`, human approves; never auto-submit |
| Status tracking | Kanban stages (Saved→Applied→Interview→Offer) | Dashboard | DB status lifecycle as the inter-agent channel |
| Architecture | SaaS, closed | SaaS, closed | Self-hosted, provider-agnostic LLM, plugin agents |

## Sources

- [Best AI for Job Applications 2026 (Teal/Jobscan/CVnomist/Resume.io)](https://bestjobsearchapps.com/articles/en/best-ai-for-job-applications-6-top-tools-for-tailoring-ats-optimization-job-matching-in-2026) — MEDIUM
- [7 Best AI Resume Optimization Tools / ATS Match 2026](https://bestjobsearchapps.com/articles/en/7-best-ai-resume-optimization-tools-for-ats-match-rates-in-2026) — MEDIUM
- [ATS Keyword Matching Algorithm Explained (resumegyani)](https://resumegyani.in/ats-guides/ats-keyword-matching-algorithm) — MEDIUM
- [ATS Resume Keywords Guide: What Actually Works in 2026 (uppl.ai)](https://www.uppl.ai/ats-resume-keywords) — MEDIUM (thresholds, stuffing risk)
- [How to Build an LLM-Based Resume Analyzer (Mercity)](https://www.mercity.ai/blog-post/build-an-llm-based-resume-analyzer/) — MEDIUM (rubric structure)
- [Context-Aware Multi-Agent Framework for Resume Screening (arXiv 2504.02870)](https://arxiv.org/html/2504.02870v1) — MEDIUM (explainable scoring, sub-agents)
- [Human and LLM-Based Resume Matching (NAACL 2025 findings)](https://aclanthology.org/2025.findings-naacl.270.pdf) — MEDIUM (semantic match validity)
- [Job Tracking Stages: Applied/Interview/Offer/Rejected (jobshinobi)](https://www.jobshinobi.com/blog/job-tracking-stages-applied-interview-offer-rejected) — MEDIUM (lifecycle vocabulary)
- [Huntr vs Teal 2026](https://huntr.co/blog/huntr-vs-teal) — MEDIUM (pipeline stages)
- [6 ATS Platforms with Public Job Posting APIs (Cavuno)](https://cavuno.com/blog/ats-platforms-public-job-posting-apis) — HIGH (public endpoints, no-auth)
- [Greenhouse/Lever/Ashby Job Scraper — unified deduped schema (Apify)](https://apify.com/bovi/greenhouse-lever-ashby-job-scraper) — HIGH (endpoints, dedup, normalized fields)
- [The Risks of AI-Generated Resumes (Robert Half)](https://www.roberthalf.com/us/en/insights/hiring-help/the-risks-of-ai-generated-resumes-what-finance-leaders-should-know) — MEDIUM (fabrication risk)
- [41% Hiding Secret Text in Resumes (Interview Guys)](https://blog.theinterviewguys.com/job-seekers-are-hiding-secret-text-in-their-resumes/) — LOW–MEDIUM (hidden-keyword anti-feature)

---
*Feature research for: autonomous job-application agent (v1 core pipeline)*
*Researched: 2026-06-29*
