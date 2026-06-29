# Stack Research

**Domain:** Autonomous multi-agent job-application system (TypeScript/Node.js, plugin-based, SQLite, LLM-driven)
**Researched:** 2026-06-29
**Confidence:** HIGH (versions verified against npm; ecosystem recommendations cross-checked with official docs and multiple sources)

---

## TL;DR Recommendations

| Dimension | Recommendation | Confidence |
|-----------|----------------|------------|
| ORM (SQLite) | **Drizzle ORM** + `better-sqlite3` | HIGH |
| Job discovery | **Public ATS JSON APIs via native `fetch`/`undici`** (NOT Playwright DOM scraping) | HIGH |
| Browser automation (v2 auto-apply) | **Playwright** (`@playwright/test`) | HIGH |
| PDF generation | **HTML/CSS template → Playwright `page.pdf()`** (reuse the Playwright dependency) | HIGH |
| LLM layer | **Vercel AI SDK (`ai` v5)** with official provider packages behind your own `LLMProvider` interface | HIGH |
| Config | **`yaml` package** (NOT `js-yaml`) + **Zod v4** validation | HIGH |
| Scheduling | **`croner`** for in-process; **system cron / Codex Scheduled Tasks** invoke the CLI | HIGH |
| Test runner | **Vitest** | HIGH |
| Build/runtime | **`tsx`** (dev) + **`tsup`** (build) | HIGH |
| Logging | **`pino`** + `pino-pretty` (dev only) | HIGH |
| Tooling | **pnpm + ESLint (flat config) + Prettier + TypeScript strict** | HIGH |

> **Single biggest finding:** Greenhouse, Lever, Ashby, and Workable all expose **public, no-auth JSON APIs** for their job boards. For v1 Discovery you should hit those endpoints with `fetch`, not drive a headless browser. Playwright stays in the stack but its real job is **v2 auto-apply form-fill**, not v1 discovery. This is a major robustness and cost win and should shape the Collector/Adapter design.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | `^5.9` (6.0 line emerging — pin to 5.9 LTS for stability) | Language across all agents | Project constraint; single-language stack. Use `strict: true`. |
| Node.js | `>=22 LTS` (24 also fine) | Runtime | Native `fetch`, stable ESM, `--watch`, native SQLite available but `better-sqlite3` still preferred for ORM support. |
| Drizzle ORM | `drizzle-orm ^0.45`, `drizzle-kit ^0.31` | SQLite persistence (`Jobs`, `Applications`) | Schema-as-TypeScript = no codegen step, types ARE the schema. ~57KB, near-zero runtime overhead, thin SQL layer that makes a future Postgres swap genuinely transparent (change driver + dialect). Best-in-class fit for SQLite-first projects. |
| better-sqlite3 | `^12` | Synchronous SQLite driver Drizzle binds to | Fastest Node SQLite driver; synchronous API is ideal for a CLI/batch agent system (no connection pool complexity). Drizzle's first-class SQLite driver. |
| Vercel AI SDK (`ai`) | `^5` | Provider-agnostic LLM core (`generateObject`, `generateText`) | Unified interface over OpenAI/Anthropic/Google. `generateObject` + Zod gives **structured scoring/customization output with automatic schema validation** — exactly what Matching (0-100 + strengths/gaps) and Resume agents need. Use structured outputs natively where supported, prompt+validate fallback elsewhere. |
| Playwright | `@playwright/test ^1.61` | v2 auto-apply form-fill; fallback scraping for non-API sources | Industry standard for browser automation, auto-wait, best-in-class debugging (trace viewer, codegen). Reserved for v2 but installed early so resume-PDF rendering can reuse it. |
| Zod | `^4` | Config validation + LLM structured-output schemas | De-facto TS validation standard; v4 is faster and smaller. Single schema source feeds both YAML validation and AI SDK `generateObject`. |
| croner | `^10` | In-process scheduling (when not using system cron) | TypeScript-native, DST-correct (uses `Intl`), error-catching (`catch` keeps the loop alive), pattern + overrun protection. More robust than node-cron for unattended production scheduling. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `yaml` | `^2.9` | Parse/stringify the YAML config file | Always. Preferred over `js-yaml` (see "What NOT to Use"). Supports comments, anchors, round-tripping. |
| `@ai-sdk/openai` | latest (track `ai` v5) | OpenAI provider for the AI SDK | When `llm.provider: openai`. |
| `@ai-sdk/anthropic` | latest | Anthropic/Claude provider | When `llm.provider: anthropic`. |
| `@ai-sdk/google` | latest | Gemini provider | When `llm.provider: google`. |
| `pino` | `^10` | Structured JSON logging | Always. One logger; child loggers per agent (`log.child({ agent: 'matching' })`). |
| `pino-pretty` | `^13` | Human-readable dev logs | **Dev only** — pipe `node app | pino-pretty`. Never a prod dependency. |
| `undici` | bundled with Node 22+ | HTTP client for ATS JSON APIs | Native `fetch` (powered by undici) is sufficient; pull `undici` directly only if you need pooling/retry agents. |
| `p-retry` | `^6` | Retry transient ATS API / LLM failures | Around network + LLM calls (rate limits, 429s, flaky boards). |
| `p-limit` | `^7` | Concurrency cap for parallel job scoring | Cap concurrent LLM calls to respect provider rate limits. |
| `commander` | `^14` | CLI entrypoint (`run discovery`, `run matching`, etc.) | Each agent independently runnable from CLI — directly serves the "independently executable agent" requirement and lets system cron / Codex call specific agents. |
| `date-fns` | `^4` | Date math (dedupe windows, "new since") | When you need date arithmetic beyond `Date`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm | Package manager | Fast, strict, disk-efficient. Use a workspace even if single-package, for clean structure. Set `packageManager` field. |
| tsx | Run TS directly in dev (`tsx watch src/cli.ts`) | Zero-config, esbuild-powered, fast. Best for dev loop and running agents locally. |
| tsup | Bundle/build for production | esbuild-based; outputs ESM + clean `dist/`. Pair with `tsc --noEmit` for type-checking. Tree-shakes, single config. |
| TypeScript (`tsc`) | Type-checking only (`--noEmit`) | tsup/tsx don't type-check; run `tsc --noEmit` in CI and pre-commit. |
| Vitest | Test runner | Zero-config TS + ESM, fast watch mode, Jest-compatible API, built-in mocking/coverage. |
| ESLint | Linting (flat config `eslint.config.js`) | v9+/10 uses flat config. Use `typescript-eslint` + `@eslint/js`. |
| Prettier | Formatting | Keep formatting rules out of ESLint; let Prettier own format, ESLint own correctness. |

---

## Installation

```bash
# Core
pnpm add drizzle-orm better-sqlite3 ai zod yaml croner pino commander \
  @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google p-retry p-limit date-fns

# Browser automation (v2 auto-apply + v1 PDF rendering)
pnpm add playwright @playwright/test
pnpm exec playwright install chromium

# Dev dependencies
pnpm add -D typescript tsx tsup vitest \
  drizzle-kit \
  @types/node @types/better-sqlite3 \
  eslint @eslint/js typescript-eslint prettier \
  pino-pretty
```

---

## Decision Deep-Dives

### ORM: Drizzle (recommended) vs Prisma

**Choose Drizzle.** Rationale:

- **No codegen step.** Drizzle's schema is plain TypeScript — your types ARE your schema. Prisma (even v7) keeps a `schema.prisma` DSL + `prisma generate`; the single most common Prisma support issue is "my types are wrong" because someone edited the schema and forgot to regenerate. For an autonomous, agent-driven codebase you want the type system to never drift.
- **DB-swap transparency** (an explicit PROJECT constraint). Drizzle is a thin, SQL-shaped layer — moving SQLite → Postgres is a driver + dialect change with largely identical query code. Prisma abstracts further but its migration/engine model is heavier.
- **Footprint & cold start.** Drizzle ~57KB, ~50-100ms cold start vs Prisma 7's ~1.6MB / 80-150ms. For a CLI batch job invoked on a schedule, fast startup matters every run.
- **`better-sqlite3` synchronous driver** pairs cleanly with Drizzle for a batch/CLI system — no async pool juggling.

> **Note on Prisma 7:** Prisma shipped a major rewrite in late 2025 (Rust query engine removed, now pure TS/WASM, bundle ~14MB → ~1.6MB). It is more competitive than older Prisma, and its `schema.prisma` is arguably more readable for newcomers. **Choose Prisma only if** the team strongly prefers declarative schema modeling and a GUI (Prisma Studio) over SQL fluency. For this project's constraints (SQLite-first, swap-friendly, lean CLI), Drizzle wins. *(Confidence: HIGH on Drizzle fit; MEDIUM on the exact Prisma 7 internals — verify against Prisma release notes if revisiting.)*

### Job Discovery: Public ATS JSON APIs (recommended) vs Playwright DOM scraping

**For v1 discovery, use the public JSON APIs — not browser scraping.** All four target ATS platforms publish no-auth job feeds:

- **Greenhouse:** `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` (and `/jobs/{id}` for full content). No auth for GET. (Confidence: HIGH — official Greenhouse Job Board API docs.)
- **Lever:** Public postings API with query filters (`team`, `department`, `location`, `commitment`, `level`, `skip`, `limit`). (Confidence: MEDIUM-HIGH — widely documented.)
- **Ashby:** Public job-board JSON; `includeCompensation=true` for salary. (Confidence: MEDIUM — multiple sources; verify the exact host/path against Ashby docs when implementing.)
- **Workable:** Public careers endpoints (account + jobs, plus locations/departments companions). (Confidence: MEDIUM — verify exact paths.)

**Why this matters for architecture:** The PROJECT describes "one `Collector` with an `Adapter` per ATS." That maps perfectly onto **one HTTP fetch + per-ATS response parser**, not per-ATS DOM scrapers. Benefits: no CAPTCHA, no anti-bot, no DOM-change brittleness, ~100x faster, trivial to test (deterministic JSON), no headless browser per run. Build adapters as `fetch(url) -> normalize(json) -> Job[]`.

**Playwright still belongs in the stack** for: (a) v2 auto-apply form-fill (its real job), and (b) a fallback collector for any future source without a clean API (company career pages, etc.). Do **not** center v1 discovery on it.

### PDF Generation: HTML→Playwright `page.pdf()` (recommended)

**Render an HTML/CSS resume template, then print to PDF with Playwright's `page.pdf()`.** Rationale:

- **You already depend on Playwright** (Chromium) for v2 + fallback scraping — reusing it for PDF means **zero new heavy dependency** (avoids adding Puppeteer, which is the same Chromium engine duplicated).
- **Full CSS fidelity** — fonts, layout, columns, print styles, page breaks. Resume quality is a hard project requirement; HTML/CSS is the most flexible, maintainable way to template a polished resume.
- **LLM-friendly pipeline:** LLM returns structured resume data (Zod-validated) → fill an HTML template → Playwright prints `Resume_Company.pdf`. Clean separation of content (LLM) and presentation (template).

**Alternatives and when they'd win:**
- `@react-pdf/renderer` — great if you want to define layout in React/JSX with no browser. Viable, but you'd maintain a separate non-CSS layout system and lose Chromium-grade typography. Choose only if you specifically want to avoid shipping Chromium.
- `pdf-lib` — for **editing/merging existing PDFs**, not generating from templates. Wrong tool for from-scratch resume layout.
- `md-to-pdf` — quick markdown→PDF, but limited layout control; under the hood it's Puppeteer anyway. Fine for prototypes, not production resume quality.
- `pdfkit` — low-level imperative drawing; high effort for rich layouts.

> **Pooling note:** Don't launch a fresh browser per PDF in a batch run. Launch one Chromium, reuse `context`/`page`, close at end of the agent run.

### LLM Layer: Vercel AI SDK behind your own interface (recommended)

The PROJECT constraint is **"code depends on the `LLMProvider` interface, never a concrete SDK."** Best implementation in 2025/2026:

- Define **your own thin `LLMProvider` interface** (`score(job, resume): Promise<MatchResult>`, `customizeResume(...)`). This is your stable seam — non-negotiable per the constraint.
- **Implement it once on top of the Vercel AI SDK (`ai` v5)**, which already abstracts OpenAI/Anthropic/Google. Use `generateObject({ schema: zodSchema })` so Matching and Resume outputs are **schema-validated and typed** — no manual JSON parsing, automatic structured-output where the provider supports it, prompt+validate fallback otherwise.
- Select provider/model from YAML config (`llm.provider`, `llm.model`) → pick the `@ai-sdk/*` provider at runtime.

**Why not call OpenAI/Anthropic/Google SDKs directly?** You'd hand-write three divergent integrations and three JSON-parsing/validation paths. The AI SDK collapses that to one. The official SDKs remain a valid choice if you want zero abstraction layers and maximum control — but for a provider-agnostic requirement, the AI SDK is the leverage. Your own interface still wraps it, so you can swap the AI SDK out later without touching agents. *(Confidence: HIGH.)*

### Config: `yaml` + Zod (recommended)

- Parse with the **`yaml` package** (`^2.9`), then immediately validate the parsed object with a **Zod schema**. Parse → validate → freeze → inject. Fail fast at startup with a readable Zod error if config is malformed (`zod` `.safeParse` + formatted issues).
- One Zod schema documents the entire config contract (schedule, filters, keywords, countries, `minimumMatchScore`, `llm.provider`/`model`). Reuse Zod types as your runtime config type — single source of truth.

### Scheduling: croner + system cron / Codex Scheduled Tasks

Two layers, pick per deployment:

- **Long-running daemon:** use **`croner`** in-process (DST-aware, error-catching, overrun-protected). Better than `node-cron` for unattended reliability.
- **Stateless invocation (recommended for this project):** since each agent is an independently runnable CLI command, **system cron** or **Codex Scheduled Tasks** simply invokes `node dist/cli.js run discovery` etc. on a schedule. This is the most robust model — no always-on process, OS handles scheduling, crashes don't kill future runs. The PROJECT explicitly allows cron / Codex Scheduled Tasks and rejects managed workflow tools, so the CLI-invoked-by-cron pattern is the cleanest fit. Keep `croner` available for the daemon variant. *(Codex Scheduled Tasks: treat as an external scheduler that runs your CLI command on a cron expression — confirm exact config syntax in Codex docs at integration time. Confidence: MEDIUM on Codex specifics.)*

### Build/Runtime: tsx (dev) + tsup (build)

- **`tsx`** for the dev loop (`tsx watch`) — instant, zero-config, runs TS + ESM directly.
- **`tsup`** for production builds — esbuild bundling to clean ESM `dist/`.
- **`tsc --noEmit`** for type-checking in CI/pre-commit (tsx and tsup do NOT type-check).
- **Avoid relying on `node --experimental-strip-types`** as the primary runner today: type-stripping is stabilizing but still has rough edges (no path rewriting, no full transform, flag churn across Node versions). `tsx` is the pragmatic, stable choice now; revisit native stripping once it's unflagged and battle-tested. *(Confidence: HIGH on tsx/tsup; MEDIUM on native-strip maturity timeline.)*

### Test Runner: Vitest

**Choose Vitest.** Native ESM + TypeScript with zero config (esbuild under the hood — no `ts-jest`/Babel transform layer), Jest-compatible API (easy mental model), fast watch mode, built-in mocking and coverage. Jest 30 closed much of the speed gap and is the right call only for React Native or a large existing CJS/Jest codebase — neither applies to this greenfield ESM project. *(Confidence: HIGH.)*

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Drizzle ORM | Prisma 7 | Team strongly prefers declarative schema DSL + Studio GUI over SQL fluency; values broadest DB support (incl. MongoDB). |
| ATS JSON APIs (fetch) | Playwright DOM scraping | Source has no public API (company career pages, LinkedIn — both v2+). |
| Playwright `page.pdf()` | `@react-pdf/renderer` | You want to avoid shipping Chromium entirely and accept defining layout in JSX. |
| Vercel AI SDK | Official OpenAI/Anthropic/Google SDKs directly | You want zero abstraction and are willing to hand-write per-provider integration + validation. |
| `yaml` | `js-yaml` | Legacy projects already on it; otherwise prefer `yaml`. |
| croner | node-cron | Simple, non-critical scheduling where you don't care about DST edge cases. |
| Vitest | Jest 30 | React Native target, or large existing Jest/CJS suite. |
| tsx + tsup | `node --experimental-strip-types` | Once native type-stripping is unflagged/stable and you want zero build tooling. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Playwright/Puppeteer for **v1 job discovery** | ATS boards expose public JSON APIs — browser scraping adds CAPTCHA/anti-bot/DOM-brittleness, slowness, and cost for zero benefit | `fetch` against Greenhouse/Lever/Ashby/Workable JSON endpoints |
| Adding **Puppeteer** for PDFs | Duplicates the Chromium engine you already ship via Playwright | Playwright `page.pdf()` |
| **`js-yaml`** | v5 went ESM-only and is less round-trip/comment friendly; ecosystem momentum is on `yaml` | `yaml` (`^2.9`) |
| **TypeORM / Sequelize** | Heavier, decorator/active-record baggage, weaker TS inference, more boilerplate for a lean CLI | Drizzle |
| **node-cron** for unattended prod | Naive DST handling can fire jobs at wrong hour/skip/double-fire twice a year | croner (or system cron) |
| **`ts-node`** | Slower, more config friction than tsx for modern ESM/TS | tsx |
| **`pino-pretty` in production** | It's a dev formatter; in prod emit raw JSON to stdout for log aggregation | Plain `pino` JSON; pretty only when piping locally |
| **Calling concrete LLM SDKs from agents** | Violates the provider-agnostic constraint; creates 3 divergent code paths | Your `LLMProvider` interface over the AI SDK |
| **LangChain** for this scope | Heavy abstraction, churny API; overkill for "score + customize" calls | Vercel AI SDK `generateObject` + Zod |
| **n8n / Make / low-code orchestrators** | Explicitly rejected in PROJECT — everything is code | CLI agents + cron/Codex |

---

## Stack Patterns by Variant

**If running as scheduled stateless jobs (recommended):**
- Each agent = a `commander` subcommand (`run discovery`, `run matching`, `run resume`).
- System cron / Codex Scheduled Tasks invokes the built CLI on intervals.
- No always-on process; OS owns scheduling; failures are isolated per run.

**If running as a long-lived daemon:**
- Single process boots, registers `croner` jobs from YAML schedule, stays resident.
- Use `croner`'s `catch` + overrun protection so one slow run never stacks/kills the loop.

**If a future source lacks a public API (career pages, LinkedIn — v2+):**
- Add a Playwright-based collector adapter behind the same `Collector` interface.
- Keep it isolated so its brittleness can't affect the stable JSON-API adapters.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `drizzle-orm ^0.45` | `better-sqlite3 ^12`, `drizzle-kit ^0.31` | drizzle-kit handles migrations; keep orm + kit versions in lockstep per Drizzle releases. |
| `ai ^5` | `@ai-sdk/openai`/`anthropic`/`google` (matching major) | AI SDK provider packages are versioned to the core; upgrade together. |
| `zod ^4` | `ai ^5`, your config validator | Confirm AI SDK's Zod peer range when pinning — AI SDK v5 targets Zod 3/4; verify at install. |
| `better-sqlite3 ^12` | Node 22/24 | Native module — needs matching prebuilt binaries; rebuild on Node major upgrades. |
| ESLint `^9`/`10` | `typescript-eslint`, flat config | Flat config (`eslint.config.js`) is required on v9+; legacy `.eslintrc` is deprecated. |
| Playwright `^1.61` | `playwright install chromium` | Browser binaries are version-pinned; run `playwright install` after upgrades. |

---

## Sources

- npm registry (`npm view <pkg> version`) — **verified current versions** for drizzle-orm 0.45.2, drizzle-kit 0.31.10, better-sqlite3 12.11.1, playwright 1.61.1, vitest 4.1.9, tsx 4.22.4, tsup 8.5.1, zod 4.4.3, pino 10.3.1, pino-pretty 13.1.3, croner 10.0.1, node-cron 4.5.0, yaml 2.9.0, @anthropic-ai/sdk 0.106.0, openai 6.45.0, @google/genai 2.10.0, pdf-lib 1.17.1, @react-pdf/renderer 4.5.1, puppeteer 25.2.1, typescript 6.0.3, eslint 10.6.0, prettier 3.9.1 — **HIGH**
- developers.greenhouse.io/job-board.html — Greenhouse public Job Board API (no-auth GET, `boards-api.greenhouse.io/v1/boards/{token}/jobs`) — **HIGH**
- prisma.io/docs/orm/more/comparisons/prisma-and-drizzle + makerkit/encore/bytebase comparison articles — Drizzle vs Prisma 2026, Prisma 7 rewrite details — **MEDIUM-HIGH**
- vitest.dev/guide/comparisons + multiple Jest-vs-Vitest 2025/2026 articles — test runner recommendation — **HIGH**
- vercel.com/docs/ai-sdk + github.com/vercel/ai + ai-sdk.dev/docs — provider-agnostic LLM layer, `generateObject` + Zod — **HIGH**
- croner.56k.guru + pkgpulse scheduler comparison — croner DST/error-handling advantages — **MEDIUM-HIGH**
- Apify ATS scraper listings + cavuno.com/blog/ats-platforms-public-job-posting-apis — confirmation that Lever/Ashby/Workable expose public JSON feeds — **MEDIUM** (verify Lever/Ashby/Workable exact endpoints against their own docs at implementation time)
- blog.risingstack.com (Puppeteer HTML→PDF) + pdfnoodle PDF library roundup — PDF generation approaches — **MEDIUM**

---
*Stack research for: autonomous multi-agent job-application system (TypeScript)*
*Researched: 2026-06-29*
