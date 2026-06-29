# Architecture Research

**Domain:** Plugin-based multi-agent job-application pipeline (TypeScript/Node.js, SQLite)
**Researched:** 2026-06-29
**Confidence:** HIGH (patterns are well-established; ORM/queue specifics verified against current sources)

## Standard Architecture

The system is a **pipeline of independent agents coordinated through a shared SQLite database**. No agent imports or calls another agent. The database is the single source of truth and the only inter-agent channel. Each agent is a plugin implementing one interface, runnable in isolation (own CLI entrypoint) and invoked by a scheduler.

The governing pattern is **DB-as-message-bus driven by status fields**: a row's `status` column is the message. An agent claims rows in one state, does its work, and transitions them to the next state. This is a durable, observable, crash-safe choreography — there is no central orchestrator deciding what runs when beyond the scheduler's "run agent X now."

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          SCHEDULER / CLI LAYER                         │
│   cron / Codex Tasks  ──▶  scheduler  ──▶  spawns or imports agents    │
│   bin/discovery.ts   bin/matching.ts   bin/resume.ts  (1 entry/agent)  │
└───────────────────────────────┬──────────────────────────────────────┘
                                 │  registry.get(name).run(ctx)
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            AGENT LAYER (plugins)                       │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐                    │
│  │ Discovery  │    │  Matching  │    │   Resume   │   (+ future agents)│
│  │   Agent    │    │   Agent    │    │   Agent    │                    │
│  └─────┬──────┘    └─────┬──────┘    └─────┬──────┘                    │
│        │ uses            │ uses            │ uses                      │
│   ┌────▼─────────┐  ┌────▼──────┐    ┌─────▼──────┐                    │
│   │ Collector +  │  │ LLMProvider│   │ LLMProvider│                    │
│   │ ATS Adapters │  │           │    │ + PDF gen  │                    │
│   └──────────────┘  └───────────┘    └────────────┘                    │
└───────┬───────────────────┬──────────────────┬───────────────────────┘
        │ all I/O via        │                  │
        ▼ repositories       ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       DATA-ACCESS LAYER (repositories)                 │
│   JobRepository · ApplicationRepository  (thin wrappers over ORM)      │
└───────────────────────────────┬──────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PERSISTENCE — SQLite (single file, WAL)             │
│   Jobs(status: NEW → SCORED → TAILORED ...)   Applications             │
│                  ◀── THE MESSAGE BUS ──▶                               │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Agent** | One unit of work over the DB. Claims rows in state A, writes rows in state B. | Class/object implementing `Agent` interface; pure orchestration, delegates I/O |
| **AgentRegistry** | Maps agent `name` → instance. Enables discovery & open/closed extension. | `Map<string, Agent>` with `register`/`get`/`list` |
| **AgentContext** | Injected dependencies for a run (db/repos, llm, config, logger, clock). | Plain object built once per process, passed into `run()` |
| **Collector** | Orchestrates discovery across ATS sources; dedupes; normalizes. | Iterates configured `ATSAdapter`s, merges results |
| **ATSAdapter** | Fetch + parse one ATS into a canonical `RawJob`. One per ATS. | `greenhouse.ts`, `lever.ts`, `ashby.ts`, `workable.ts` |
| **LLMProvider** | Provider-agnostic completion/structured-output calls. | Interface + `openai.ts`/`claude.ts`/`gemini.ts` impls |
| **Repository** | Typed CRUD + status-transition queries; hides the ORM. | `JobRepository`, `ApplicationRepository` over Drizzle |
| **Config** | Loads/validates YAML once; typed, injected everywhere. | YAML → Zod schema → frozen typed object |
| **Scheduler** | Decides when each agent runs; invokes the registry. | cron expressions → `registry.get(name).run(ctx)` |

## Recommended Project Structure

```
src/
├── agents/
│   ├── agent.ts              # Agent, AgentContext, AgentResult contracts
│   ├── registry.ts           # AgentRegistry (Map-based) + registerAll()
│   ├── discovery/
│   │   ├── discovery-agent.ts # implements Agent; uses Collector
│   │   ├── collector.ts       # orchestrates adapters, dedupe, normalize
│   │   ├── adapter.ts         # ATSAdapter interface + RawJob type
│   │   ├── greenhouse.ts      # ATSAdapter impl
│   │   ├── lever.ts
│   │   ├── ashby.ts
│   │   └── workable.ts
│   ├── matching/
│   │   └── matching-agent.ts  # NEW → SCORED; uses LLMProvider
│   └── resume/
│       ├── resume-agent.ts    # SCORED(≥min) → TAILORED; LLM + PDF
│       └── pdf.ts             # PDF rendering (isolated side effect)
├── db/
│   ├── schema.ts             # Drizzle table defs (Jobs, Applications)
│   ├── client.ts             # better-sqlite3 + drizzle; WAL pragma
│   ├── migrations/           # drizzle-kit generated SQL
│   └── repositories/
│       ├── job-repository.ts
│       └── application-repository.ts
├── llm/
│   ├── provider.ts           # LLMProvider interface + shared types
│   ├── openai.ts
│   ├── claude.ts
│   ├── gemini.ts
│   └── factory.ts            # config.llm.provider → concrete impl
├── config/
│   ├── schema.ts             # Zod schema for the YAML
│   └── load.ts               # read + validate + freeze
├── scheduler/
│   └── scheduler.ts          # cron map → registry invocation
├── context.ts                # buildContext(): wires repos/llm/config/logger
└── bin/                       # one independently-runnable entry per agent
    ├── discovery.ts          # buildContext() → run discovery agent
    ├── matching.ts
    ├── resume.ts
    └── scheduler.ts          # the long-running scheduler process
config.yaml                    # schedule, filters, minimumMatchScore, llm.provider
```

### Structure Rationale

- **`agents/<name>/`:** Each agent is a self-contained folder. Adding an agent = new folder + one `registry.register()` line. Existing agents are never touched (open/closed).
- **`agents/discovery/` holds Collector + Adapters:** Discovery is the only agent with sub-structure because it has the Collector/Adapter fan-out. A new ATS = one new file + one line in the collector's adapter list.
- **`db/repositories/` separate from `db/schema.ts`:** Agents depend on repository interfaces, never on Drizzle or raw SQL. This is what makes a future Postgres swap "near-transparent."
- **`llm/` mirrors the provider-agnostic rule:** Agents import only `LLMProvider`; the `factory` is the single place that knows concrete SDKs.
- **`bin/` = independent executability:** Each agent has a thin entrypoint so it can run via `node bin/matching.js` for testing, manual runs, or scheduler shell-out. The scheduler can also *import* and call agents in-process — both modes share `buildContext()`.

## Architectural Patterns

### Pattern 1: Unified Agent Interface + Registry (the plugin core)

**What:** Every agent implements one tiny contract. A registry maps names to instances.
**When to use:** Always — this is the system's extension seam.
**Trade-offs:** Uniformity costs a little ceremony for trivial agents; pays off massively as agent count grows.

```typescript
// agents/agent.ts
export interface AgentContext {
  jobs: JobRepository;
  applications: ApplicationRepository;
  llm: LLMProvider;
  config: Config;
  logger: Logger;
  now: () => Date;           // injected clock → deterministic tests
}

export interface AgentResult {
  agent: string;
  processed: number;
  succeeded: number;
  failed: number;
  notes?: string;
}

export interface Agent {
  readonly name: string;
  run(ctx: AgentContext): Promise<AgentResult>;
}

// agents/registry.ts
export class AgentRegistry {
  private agents = new Map<string, Agent>();
  register(a: Agent) {
    if (this.agents.has(a.name)) throw new Error(`dup agent: ${a.name}`);
    this.agents.set(a.name, a);
  }
  get(name: string): Agent {
    const a = this.agents.get(name);
    if (!a) throw new Error(`unknown agent: ${name}`);
    return a;
  }
  list(): Agent[] { return [...this.agents.values()]; }
}
```

### Pattern 2: DB-as-Message-Bus via Status Fields (the choreography)

**What:** The `Jobs.status` column is the queue. Agents are stateless consumers that claim rows in one status and emit them in the next. Pipeline: `NEW → SCORED → TAILORED` (plus terminal states like `REJECTED_LOW_SCORE`, `ERROR`).
**When to use:** Whenever agents must coordinate without talking to each other — exactly this project's hard constraint.
**Trade-offs:** Status as message is simple, durable, and inspectable (you can `SELECT` the pipeline state at any moment). The cost is discipline: every transition must be explicit and atomic, and you need a convention for failures (e.g., `error_count`, `last_error`).

```typescript
// Each agent reads ONE status, writes the NEXT — never calls another agent.
async run(ctx: AgentContext): Promise<AgentResult> {
  const batch = ctx.jobs.claimByStatus('NEW', 'SCORING', this.name); // atomic
  for (const job of batch) {
    const score = await this.scoreOne(job, ctx);   // LLMProvider
    ctx.jobs.transition(job.id, 'SCORED', { score, ...score.fields });
  }
  return { agent: this.name, processed: batch.length, ... };
}
```

**Atomic claim (critical):** SQLite is single-writer, so claiming must be one atomic statement to prevent double-processing if two runs overlap. Use `BEGIN IMMEDIATE` and an `UPDATE ... RETURNING` (or update-then-select inside the transaction). Enable `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout` so readers never block and brief contention retries instead of failing.

```sql
-- inside BEGIN IMMEDIATE
UPDATE jobs SET status='SCORING', claimed_by=?, claimed_at=?
WHERE id IN (SELECT id FROM jobs WHERE status='NEW' LIMIT 50)
RETURNING *;
```

In v1 the scheduler runs agents sequentially, so contention is near-zero — but building the atomic claim now is cheap insurance for future parallel/overlapping runs and crash recovery.

### Pattern 3: Collector + per-ATS Adapter (discovery fan-out)

**What:** `Collector` knows the *workflow* (which sources, dedupe, normalize, persist as `NEW`). Each `ATSAdapter` knows *one ATS's quirks* (URL shape, DOM/JSON parsing) and returns a canonical `RawJob`.
**When to use:** Any time you integrate N similar-but-different external sources.
**Trade-offs:** One extra indirection; in exchange, a new board is additive (open/closed) and each adapter is independently testable against saved fixtures.

```typescript
// agents/discovery/adapter.ts
export interface ATSAdapter {
  readonly id: 'greenhouse' | 'lever' | 'ashby' | 'workable';
  fetchJobs(company: CompanyConfig): Promise<RawJob[]>;
}
// collector iterates configured adapters; dedupes by canonical key
// (e.g. ats + externalId, or normalized url) before writing NEW rows.
```

**Implementation note (verified):** Greenhouse, Lever, Ashby, and Workable all expose **public JSON job-board APIs** in addition to HTML pages. Prefer the JSON endpoints in adapters where available — they are far more stable than DOM scraping and avoid Playwright for most discovery. Reserve Playwright for sources that genuinely require a rendered DOM. This keeps v1 discovery robust and fast.

### Pattern 4: Provider-Agnostic LLMProvider (anti-corruption layer)

**What:** A thin interface for the *capabilities the agents need* (text completion, structured/JSON output). Concrete files wrap each vendor SDK. A factory selects the impl from `config.llm.provider`.
**When to use:** The project mandates it — agents must never import a vendor SDK.
**Trade-offs:** You own the abstraction surface. Keep it minimal (don't mirror every vendor feature). **Recommendation:** define your own narrow `LLMProvider` interface, and *optionally implement it on top of the Vercel AI SDK* internally — you get one normalized multi-provider client (OpenAI/Anthropic/Gemini) without coupling your agents to it. If you later drop the AI SDK, only `llm/` changes.

```typescript
export interface LLMProvider {
  readonly id: string;
  complete(req: { system?: string; prompt: string }): Promise<string>;
  completeStructured<T>(req: {
    system?: string; prompt: string; schema: ZodSchema<T>;
  }): Promise<T>;            // matching/resume need typed JSON out
}
```

### Pattern 5: Repository Layer over the ORM (data-access isolation)

**What:** Agents depend on `JobRepository`/`ApplicationRepository` interfaces. Repositories own the schema, the queries, and the status-transition helpers. The ORM (Drizzle) lives *only* here.
**When to use:** Always in this project — it's the seam that delivers the "near-transparent DB swap" constraint and makes agents trivially unit-testable with in-memory fakes.
**Trade-offs:** Slight duplication vs. calling the ORM directly; worth it for testability and the storage constraint.

### Pattern 6: Dependency Injection via Context (no DI framework)

**What:** `buildContext()` constructs repos, the LLM provider, config, logger, and clock once, then hands the `AgentContext` to `run()`. No service locator, no decorators, no container library.
**When to use:** This scale — constructor/parameter injection is plenty. A DI framework (tsyringe/InversifyJS) would be over-engineering.
**Trade-offs:** Manual wiring in `buildContext()`; in exchange, tests just pass a hand-built context with fakes. Injecting `now()` and the logger keeps agents deterministic and quiet in tests.

## Data Flow

### Pipeline Flow (the core loop)

```
[Scheduler tick / CLI run]
        │
        ▼
Discovery Agent ── Collector → [greenhouse|lever|ashby|workable] adapters
        │  dedupe + normalize
        ▼
   INSERT Jobs (status = NEW)
        │
        ▼  (next scheduled run, separate process/invocation)
Matching Agent ── claim NEW → SCORING → LLMProvider.scoreFit()
        │
        ▼
   UPDATE Jobs SET status = SCORED, score, strengths, gaps, recommendation
        │
        ├──▶ score <  minimumMatchScore  →  status = REJECTED_LOW_SCORE (terminal)
        │
        ▼  score ≥ minimumMatchScore
Resume Agent ── claim SCORED(eligible) → TAILORING → LLMProvider.tailor() → PDF
        │  (reorder/rewrite/emphasize ONLY — never invent)
        ▼
   write Resume_Company.pdf;  UPDATE Jobs SET status = TAILORED, resume_path
        │
        ▼
   (v2: Application Agent picks up TAILORED → READY_FOR_SUBMIT)
```

### State Management

State lives **entirely in the `Jobs.status` column** — there is no in-memory shared state between agents and no message broker. The transition map *is* the protocol:

```
NEW ──▶ SCORING ──▶ SCORED ──▶ TAILORING ──▶ TAILORED ──▶ (v2: READY_FOR_SUBMIT)
                       │
                       └──▶ REJECTED_LOW_SCORE        (any) ──▶ ERROR (with last_error)
```

### Key Data Flows

1. **Discovery → DB:** External ATS JSON/DOM → `RawJob` → canonical `Job` rows as `NEW`. Dedup key prevents re-inserting known jobs across runs.
2. **DB → Matching → DB:** Claim `NEW`, LLM-score against resume, write score + analysis, branch to `SCORED` or `REJECTED_LOW_SCORE`.
3. **DB → Resume → filesystem + DB:** Claim eligible `SCORED`, LLM-tailor (integrity-constrained), render PDF to disk, record `resume_path`, set `TAILORED`.
4. **Observability flow:** Any process can `SELECT status, COUNT(*)` to see the whole pipeline — this is a free benefit of DB-as-bus.

## Scaling Considerations

This is a **single-user, scheduled batch system** — "scale" means job volume and run frequency, not concurrent users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, daily/weekly, ~100s–1000s jobs | Current design is ideal. SQLite + sequential agents. No changes. |
| Higher frequency / overlapping runs | Rely on the atomic `BEGIN IMMEDIATE` claim + WAL; bound batch sizes; add `busy_timeout`. Already designed for this. |
| Many sources / heavy LLM volume | LLM calls are the bottleneck, not the DB. Add per-agent concurrency *within* a run (bounded `p-limit`) and provider rate-limit handling. DB stays SQLite. |
| Hypothetical multi-user / cloud | Swap SQLite→Postgres at the repository layer only (the reason repositories exist). Status-field choreography ports unchanged. |

### Scaling Priorities

1. **First bottleneck: LLM throughput & cost**, not the database. Batch, cache by job content hash, and cap concurrency per run.
2. **Second bottleneck: ATS scraping fragility/rate limits.** Prefer JSON APIs, add polite delays + retries in adapters, fail one adapter without failing the run.

## Anti-Patterns

### Anti-Pattern 1: Agents calling agents

**What people do:** Discovery directly invokes Matching after inserting jobs.
**Why it's wrong:** Breaks the hard constraint, couples agents, kills independent runnability/testability, and makes failure recovery a tangle.
**Do this instead:** Discovery only writes `NEW`. Matching independently claims `NEW` on its own schedule. The DB is the only handoff.

### Anti-Pattern 2: ORM/SQL leaking into agents

**What people do:** Agents import Drizzle and write queries inline.
**Why it's wrong:** Defeats the "transparent DB swap" constraint and makes agents hard to unit-test (need a real DB).
**Do this instead:** All persistence goes through repository interfaces. Agents get fakes in tests.

### Anti-Pattern 3: Vendor SDK imported in an agent

**What people do:** `import OpenAI from 'openai'` inside the matching agent.
**Why it's wrong:** Violates provider-agnosticism; a provider swap becomes a refactor.
**Do this instead:** Agents use `LLMProvider`; the factory + `llm/` files are the only place SDKs appear.

### Anti-Pattern 4: Non-atomic claim (read-then-update)

**What people do:** `SELECT WHERE status='NEW'` then later `UPDATE`.
**Why it's wrong:** Two overlapping runs (or a crash mid-run) double-process or lose jobs.
**Do this instead:** Single atomic claim under `BEGIN IMMEDIATE` (`UPDATE ... RETURNING`), WAL + `busy_timeout`.

### Anti-Pattern 5: A "god" base-agent class with shared logic

**What people do:** Abstract base class accumulating discovery/matching/resume helpers.
**Why it's wrong:** Re-couples agents through inheritance; changing the base risks all agents (violates open/closed in spirit).
**Do this instead:** Share via *injected* collaborators in `AgentContext` and small standalone utilities, not inheritance.

### Anti-Pattern 6: Hardcoded values / config read ad hoc

**What people do:** `if (score > 70)` or reading `process.env` deep inside an agent.
**Why it's wrong:** Violates the config-driven constraint; untestable; scattered knobs.
**Do this instead:** Load+validate YAML once (Zod), inject typed `Config` via context. `minimumMatchScore`, filters, schedule, `llm.provider` all come from there.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Greenhouse / Lever / Ashby / Workable | One `ATSAdapter` each; prefer public JSON board APIs over DOM | JSON endpoints far more stable than scraping; Playwright only where DOM render is required |
| OpenAI / Claude / Gemini | Behind `LLMProvider`; one impl per vendor, selected by config | Consider implementing the interface on top of Vercel AI SDK for one normalized client |
| Filesystem (PDFs) | Resume agent writes `Resume_Company.pdf`; path recorded in DB | Keep PDF rendering isolated in `resume/pdf.ts` |
| cron / Codex Scheduled Tasks | Triggers `bin/*.ts` or the scheduler process | Each agent independently runnable; scheduler can shell-out or import |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Agent ↔ Agent | **DB status fields ONLY** (no direct calls) | The defining constraint |
| Agent ↔ Persistence | Repository interfaces | ORM hidden; enables DB swap + fakes |
| Agent ↔ LLM | `LLMProvider` interface | No vendor SDK in agents |
| Scheduler ↔ Agent | `registry.get(name).run(ctx)` or spawn `bin/<agent>` | Two invocation modes, shared `buildContext()` |
| Discovery ↔ ATS | Collector → Adapters → `RawJob` | New source = additive |

## Build Order Implications (for roadmap)

Dependencies dictate this order — each layer is a prerequisite for the agents above it:

1. **Foundation first: `config/`, `db/` (schema + client + repositories), `agents/agent.ts` contracts + `registry.ts`.** Nothing runs without typed config, the persistence seam, and the Agent contract. Build the atomic claim/transition helpers here.
2. **`llm/` provider abstraction + one concrete impl.** Matching and Resume both depend on it; build the interface and a single provider before either agent.
3. **Discovery Agent (Collector + Adapters).** Produces the `NEW` rows everything else consumes — must exist before the pipeline has data. Start with one adapter (e.g., Greenhouse JSON), then add the others additively.
4. **Matching Agent.** Depends on `NEW` rows (Discovery) + `LLMProvider`. Produces `SCORED`.
5. **Resume Agent.** Depends on `SCORED` rows + `LLMProvider` + PDF rendering. Produces `TAILORED`.
6. **Scheduler + `bin/` entrypoints.** Can be stubbed early (manual `bin/*` runs validate each agent), but the real cron/Codex scheduler wiring lands last once agents are proven.

**Vertical-slice option:** after the foundation (steps 1–2), a thin Discovery→Matching→Resume slice with a single ATS adapter and a single LLM provider proves the whole DB-as-bus loop end to end before breadth (more adapters, more providers) is added. This de-risks the core choreography early.

**Greenfield ORM recommendation:** Use **Drizzle ORM + better-sqlite3**. Rationale: zero codegen step (pure TypeScript, no `prisma generate` friction), thin SQL-close API that hands queries straight to `better-sqlite3` (synchronous, ideal for a local CLI/batch tool), first-class `BEGIN IMMEDIATE`/raw-SQL escape hatch for the atomic-claim pattern, and a tiny footprint — all of which fit a thin repository layer better than Prisma's heavier abstraction. Prisma remains a valid alternative if schema-DSL readability is prioritized over SQL control.

## Sources

- [Drizzle vs Prisma 2026 (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/) — MEDIUM
- [Drizzle vs Prisma 2026 (Encore)](https://encore.dev/articles/drizzle-vs-prisma) — MEDIUM
- [A SQLite Background Job System (JasonGorman)](https://jasongorman.uk/writing/sqlite-background-job-system/) — MEDIUM (atomic claim / single-writer)
- [Durable Message Queue on SQLite for AI Agent Orchestration (DEV)](https://dev.to/minnzen/building-a-durable-message-queue-on-sqlite-for-ai-agent-orchestration-335m) — LOW/MEDIUM (status-field bus pattern)
- [Vercel AI SDK — Providers and Models](https://ai-sdk.dev/docs/foundations/providers-and-models) — HIGH (unified provider interface)
- [Unified AI interfaces with Vercel AI SDK (LogRocket)](https://blog.logrocket.com/unified-ai-interfaces-vercel-sdk/) — MEDIUM
- [OCP + Factory/Registry in TypeScript (Medium)](https://medium.com/@bouhouchchamseddine/%EF%B8%8F-open-closed-principle-ocp-factory-pattern-in-typescript-49d54df698a3) — MEDIUM
- [Node.js Plugin Architecture 2026 (OneUptime)](https://oneuptime.com/blog/post/2026-01-26-nodejs-plugin-architecture/view) — MEDIUM (registry/manifest pattern)
- Training data (HIGH for established patterns: repository, DI-via-context, anti-corruption layer, choreography vs orchestration)

---
*Architecture research for: plugin-based multi-agent job-application pipeline (TypeScript/SQLite)*
*Researched: 2026-06-29*
