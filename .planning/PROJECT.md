# Autonomous Job Application Agent

## What This Is

A production-quality, multi-agent TypeScript system that automates the job-application pipeline for its owner — discovering relevant roles, scoring fit against a resume, and tailoring the resume per job. It runs on scheduled intervals (daily/weekly) and is built as a long-term, extensible autonomous platform, not a collection of scripts. Each agent has a single responsibility, is independently executable, and communicates only through a shared SQLite database.

## Core Value

Reduce manual job-search work by 90%+ while maintaining high application quality — the discovery → matching → resume-tailoring loop must run autonomously and produce trustworthy, job-specific resumes.

## Requirements

### Validated

(None yet — ship to validate)

### Active

<!-- v1 = Core pipeline. See REQUIREMENTS.md for the scoped, ID'd list. -->

- [ ] Companies as an emergent knowledge base — a `Company` entity (ats, boardToken, etc.) that accumulates over time; v1 seeds companies as a bootstrap only
- [ ] Job Discovery Agent — reads `active` companies with a known ATS + board token, dispatches each to the right ATS adapter (Greenhouse, Lever, Ashby, Workable), syncs jobs, dedupes, stores as `NEW`
- [ ] Matching Agent — score every `NEW` job 0–100 vs resume; output strengths, missing skills, recommendation
- [ ] Resume Customization Agent — for jobs above configurable score, produce `Resume_Company.pdf` (reorder/rewrite/emphasize only — never invent experience)
- [ ] SQLite persistence — `Jobs` and `Applications` tables via an ORM (Drizzle or Prisma)
- [ ] Provider-agnostic LLM interface — `LLMProvider` with OpenAI/Claude/Gemini implementations, selected via config
- [ ] Plugin-based agent architecture — unified `Agent` interface, agents added without modifying existing ones
- [ ] Scheduler — runs agents on configured intervals (cron / Codex Scheduled Tasks)
- [ ] Config-driven — no hardcoded values; YAML config for schedule, filters, min match score, LLM provider

### Out of Scope

<!-- v1 boundaries. Reasoning kept to prevent re-adding. -->

- Application Agent (Playwright auto-apply) — most fragile piece; build on a stable base. **v2.** When built: fill everything, stop at `READY_FOR_SUBMIT`, capture screenshot + resume + match score, require one human click. Never auto-submit. Never answer screening questions without explicit config.
- Email Monitoring Agent (Gmail) — fragile, auth-heavy; **v2** once core loop is stable.
- Cover Letter Agent — **v2** (close to resume agent, deferred to keep v1 tight).
- Weekly Reporting Agent — **v2**.
- LinkedIn as a source — constant DOM changes, login, anti-bot, CAPTCHA, ToS risk. Add only after ATS pipeline is robust. **v2+.**
- Company Discovery Agent — a separate future pipeline that finds previously-unknown companies from external sources (aggregators, YC, Product Hunt, RSS, startup DBs), detects their ATS, and extracts the board token → writes `Company` records. **v2.** v1 replaces this with manual seeding; the seam is designed so the agent drops in without changing Job Discovery.
- Company Intelligence / Enrichment Agent — enriches `Company` records (industry, stage, employee count, HQ, funding, remote policy, tech stack, Glassdoor, notes), fully independent of discovery. **v2.**
- Curation layer — combines signals (match score, company quality, stage, salary, remote-friendliness, tech stack, growth) into a priority ranking (HIGH/MED/LOW), evolving the system from a job scraper into a career-decision platform. **Future.**
- Company career pages as a source — heterogeneous; **future.**
- CSV / Google Sheets / Airtable storage — explicitly rejected; SQLite from day one.
- n8n / Make / any low-code orchestrator — everything is code.
- Future agents (LinkedIn networking, recruiter follow-up, salary analysis, interview prep, portfolio optimization, resume A/B testing, market trends) — architecture must support them; not built in v1.

## Context

- Owner is the sole user; targets Frontend / React / Next.js / TypeScript / Full Stack roles, Junior–Mid, Remote and Israel.
- **Source ≠ Company.** A *Source* is an ATS provider (Greenhouse, Lever, Ashby, Workable) that knows how to fetch a board's published jobs given a board token. A *Company* is a domain entity (`id, name, ats, boardToken, careersUrl, website, firstSeenAt, lastSeenAt, active`) that accumulates into a knowledge base — no manual maintenance assumed long-term.
- **Two independent pipelines, joined only by the `Companies` table.** *Company Discovery* ("which companies exist worth tracking?") is a future agent; *Job Discovery* ("what jobs does a known company have right now?") is v1. Job Discovery reads `Company` records and never knows how they got there — so manual seeding can be replaced by an automated Company Discovery agent without touching Job Discovery.
- **Discovery vs Curation.** Discovery answers "what jobs exist?"; Curation (future) answers "which opportunities are worth pursuing?" by combining match score + company quality + signals into a priority ranking. Kept as separate layers.
- ATS boards (Greenhouse, Lever, Ashby, Workable) expose per-board public JSON APIs (the board token *is* the company) → one `Collector` dispatches a company to its `Adapter` by `ats` field.
- Resume integrity is a hard rule: allowed = reorder skills, rewrite summary, emphasize relevant experience, optimize keywords. Forbidden = fake projects, companies, or technologies.
- Scheduled execution via cron or Codex Scheduled Tasks — no managed workflow tools.
- GitHub repository for the codebase.

## Constraints

- **Tech stack**: TypeScript + Node.js — single language across all agents.
- **Storage**: SQLite from day one, accessed through an ORM (Drizzle or Prisma) so a future DB swap is near-transparent.
- **Browser automation**: Playwright (used by Discovery scraping in v1; Application Agent in v2).
- **LLM**: Provider-agnostic — code depends on the `LLMProvider` interface, never a concrete SDK.
- **Architecture**: Plugin-based. Agents communicate only through the database, never call each other directly. Each agent is independently runnable, testable, and replaceable.
- **Config**: YAML, no hardcoded values (schedule, filters, keywords, countries, `minimumMatchScore`, llm.provider).
- **Quality**: Production-grade, modular, extensible — designed as a long-term platform.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1 = core pipeline (Discovery, Matching, Resume, DB, Scheduler, Config) | Most value lands after the first four stages; auto-apply + Gmail are the most fragile — build them on a stable base | — Pending |
| Provider-agnostic LLM via `LLMProvider` interface | Swap OpenAI/Claude/Gemini via config without touching the rest of the code | — Pending |
| Auto-apply stops at `READY_FOR_SUBMIT` (v2) | Human approves with one click after seeing screenshot + resume + score; prevents sending wrong resumes | — Pending |
| ATS boards first, LinkedIn later | ATS sites are structurally similar and scrapeable; LinkedIn = login/anti-bot/CAPTCHA/ToS risk | — Pending |
| SQLite + ORM from day one (Drizzle or Prisma) | Avoids CSV/Sheets/Airtable; ORM makes future DB migration near-transparent. ORM choice TBD in planning | — Pending |
| Plugin-based agents with a unified `Agent` interface (`run(ctx): Promise<AgentResult>`) | New agents added without modifying existing ones; clean as agent count grows | — Pending |
| Separate Source (ATS provider) from Company (emergent entity); Companies are an accumulating KB, not config | Discovering unknown companies is a core capability — don't assume the owner knows every company upfront | — Pending |
| Split Company Discovery (future) from Job Discovery (v1); the two meet only at the `Companies` table | Lets manual seeding be swapped for an automated discovery agent without changing the job-sync pipeline | — Pending |
| v1 seeds companies manually as a bootstrap only (not the long-term architecture) | Unblocks Job Discovery now while keeping the seam open for automated company discovery later | — Pending |

---
*Last updated: 2026-06-29 after Source/Company architecture adjustment*
