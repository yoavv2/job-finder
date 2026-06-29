---
phase: 01-foundations
plan: 05
type: execute
wave: 4
depends_on: [01, 03, 04]
files_modified:
  - package.json
  - src/agents/agent.ts
  - src/agents/registry.ts
  - src/agents/registry.test.ts
  - src/context.ts
  - src/context.test.ts
autonomous: true
requirements: [FND-07]
must_haves:
  truths:
    - "A unified Agent interface (name, run(ctx): Promise<AgentResult>) exists"
    - "A registry maps agent name -> instance such that registering a new agent requires no change to existing agents (open/closed)"
    - "AgentContext bundles the injected dependencies an agent needs (repositories, llm provider, config, logger, clock)"
    - "buildContext(config) wires repositories + llm provider + config + logger + clock into a single AgentContext"
  artifacts:
    - path: "src/agents/agent.ts"
      provides: "Agent, AgentContext, AgentResult contracts"
      exports: ["Agent", "AgentContext", "AgentResult"]
    - path: "src/agents/registry.ts"
      provides: "AgentRegistry (Map-based) with register/get/list, dup + unknown guards"
      exports: ["AgentRegistry"]
    - path: "src/context.ts"
      provides: "buildContext(config): constructs repos + llm + logger + clock into AgentContext"
      exports: ["buildContext"]
  key_links:
    - from: "src/context.ts"
      to: "src/db/repositories (buildRepositories) + src/db/client (createDbFromConfig)"
      via: "buildContext opens the DB and constructs repositories"
      pattern: "buildRepositories|createDb"
    - from: "src/context.ts"
      to: "src/llm/factory (createLLMProvider)"
      via: "buildContext selects the LLM provider from config"
      pattern: "createLLMProvider"
    - from: "src/agents/registry.ts"
      to: "src/agents/agent.ts"
      via: "registry stores/returns Agent instances by name"
      pattern: "Agent"
---

<objective>
Define the plugin core: the unified `Agent` interface (`name`, `run(ctx): Promise<AgentResult>`), the `AgentRegistry` (register/get/list) that lets new agents be added without modifying existing ones, the `AgentContext` dependency bundle, and `buildContext(config)` that wires repositories + LLM provider + config + logger + injected clock into one context object.

Purpose: This is the extension seam every future agent plugs into (Phase 2 Discovery, Phase 3 Matching, Phase 4 Resume). It ties together Plan 01 (config), Plan 03 (LLM), and Plan 04 (repositories) into the single object an agent's `run()` receives. Completes the agent-contract half of phase success criterion #3.
Output: Agent/AgentContext/AgentResult contracts, a tested AgentRegistry, and a working buildContext.
</objective>

<execution_context>
@/Users/yoavhevroni/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yoavhevroni/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/research/ARCHITECTURE.md
@.planning/phases/01-foundations/01-SUMMARY.md
@.planning/phases/01-foundations/03-SUMMARY.md
@.planning/phases/01-foundations/04-SUMMARY.md

Depends on:
- Plan 01: `Config`, `loadConfig` (src/config).
- Plan 03: `LLMProvider`, `createLLMProvider(config)` (src/llm).
- Plan 04: `buildRepositories(handles)` + repository classes (src/db/repositories), `createDbFromConfig` (src/db/client).

Architecture (locked, ARCHITECTURE.md patterns 1 + 6):
```ts
// src/agents/agent.ts
export interface AgentContext {
  jobs: JobRepository;
  companies: CompanyRepository;
  applications: ApplicationRepository;
  llm: LLMProvider;
  config: Config;
  logger: Logger;
  now: () => Date;   // injected clock -> deterministic tests
}
export interface AgentResult { agent: string; processed: number; succeeded: number; failed: number; notes?: string; }
export interface Agent { readonly name: string; run(ctx: AgentContext): Promise<AgentResult>; }
```
- Registry: Map-based; `register` throws on duplicate name; `get` throws on unknown; `list` returns all. Adding an agent = `registry.register(new XAgent())` — existing agents untouched (open/closed). DO NOT use a god base class (anti-pattern #5).
- DI via context (pattern 6): no DI framework; `buildContext()` does manual wiring. Inject `now` and a `logger` so agents are deterministic and quiet in tests.

Logging: `pino` (^10) is the locked choice (STACK.md). Use a minimal `Logger` type (info/warn/error/child) so context isn't coupled to pino's full surface; back it with pino in buildContext.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Agent / AgentContext / AgentResult contracts</name>
  <files>src/agents/agent.ts</files>
  <action>
    src/agents/agent.ts: define the contracts exactly as in <context>.
    - Import repository types from src/db/repositories, `LLMProvider` from src/llm/provider, `Config` from src/config.
    - Define a minimal `export interface Logger { info(o: unknown, msg?: string): void; warn(o: unknown, msg?: string): void; error(o: unknown, msg?: string): void; child(bindings: Record<string, unknown>): Logger; }` so AgentContext depends on this narrow type, not pino directly.
    - Export `AgentContext`, `AgentResult`, `Agent`.
    Keep this file dependency-light (types only) — it's the contract every agent imports.
  </action>
  <verify>
    <automated>pnpm typecheck && grep -q 'run(ctx: AgentContext): Promise<AgentResult>' src/agents/agent.ts</automated>
  </verify>
  <done>Agent interface (name + run(ctx): Promise<AgentResult>), AgentContext bundling repos/llm/config/logger/now, AgentResult, and a narrow Logger type are exported; typecheck clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: AgentRegistry (open/closed plugin registry)</name>
  <files>src/agents/registry.ts, src/agents/registry.test.ts</files>
  <behavior>
    - register(agent) stores it; get(name) returns it; list() returns all registered agents.
    - register a second agent with a name already present -> throws "dup agent".
    - get('unknown') -> throws "unknown agent".
    - Registering a new agent does not require modifying any existing agent (proven by registering two distinct fake agents and resolving both).
  </behavior>
  <action>
    src/agents/registry.ts: `export class AgentRegistry { private agents = new Map<string, Agent>(); register(a: Agent): void {...throw on dup...} get(name: string): Agent {...throw on missing...} list(): Agent[] { return [...this.agents.values()]; } }`
    registry.test.ts: define two trivial fake agents implementing Agent (run returns a stub AgentResult). Assert register/get/list, dup throw, unknown throw, and that both fakes resolve independently (open/closed proof).
  </action>
  <verify>
    <automated>pnpm test -- src/agents/registry.test.ts</automated>
  </verify>
  <done>Map-based AgentRegistry with register/get/list, duplicate + unknown guards; test proves two agents register without touching each other; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: buildContext wiring repos + llm + config + logger + clock</name>
  <files>src/context.ts, src/context.test.ts, package.json</files>
  <behavior>
    - buildContext(config) returns an AgentContext whose jobs/companies/applications are real repositories backed by an opened DB, llm is the provider selected by config.llm.provider, config is the passed config, logger has info/warn/error/child, and now() returns a Date.
    - A custom `now` and `logger` can be injected via an options arg for deterministic tests (e.g. buildContext(config, { now, logger })).
    - The returned context's repositories actually read/write the DB (insert a NEW job via ctx.jobs and read it back).
  </behavior>
  <action>
    Install: `pnpm add pino` (+ `pnpm add -D pino-pretty` for dev only).
    src/context.ts: `export function buildContext(config: Config, overrides?: { now?: () => Date; logger?: Logger; db?: ... }): AgentContext`:
      - open DB via `createDbFromConfig(config)` (or accept an injected handle for tests),
      - `const repos = buildRepositories(handles);`
      - `const llm = createLLMProvider(config);` (note: constructing the provider must NOT make a network call — factory just wires the SDK + key; safe in tests if env keys are set or if llm is lazily used. For tests, allow injecting a fake llm via overrides OR set dummy env keys.)
      - logger = overrides?.logger ?? pino-backed logger; now = overrides?.now ?? (() => new Date()).
      - return { jobs: repos.jobs, companies: repos.companies, applications: repos.applications, llm, config, logger, now }.
    Make llm injectable via overrides (`overrides?.llm`) so context.test can avoid real provider construction.
    context.test.ts: build a config (valid, with a temp database.path), call buildContext with overrides { now, logger (a spy/no-op), llm (a fake) }, assert the context shape, then insert a NEW job through ctx.jobs and read it back through ctx.jobs to prove the wiring is live. Use a temp db file; clean up.
  </action>
  <verify>
    <automated>pnpm test -- src/context.test.ts && pnpm typecheck</automated>
  </verify>
  <done>buildContext returns a fully-wired AgentContext (live repositories, config-selected llm, logger, injectable clock); overrides allow deterministic/offline tests; a job written through ctx.jobs reads back; tests + typecheck pass.</done>
</task>

</tasks>

<verification>
- `pnpm test` passes (registry + context tests green).
- `pnpm typecheck` clean.
- Registering a new agent requires no edit to existing agents (registry test proves open/closed).
- buildContext wires repositories (live DB), the config-selected LLM provider, a logger, and an injectable clock into one AgentContext.
- Whole phase: `pnpm test` (all plans) green and `pnpm typecheck` clean.
</verification>

<success_criteria>
Phase 1 success criterion #3 is fully met: a unified `Agent` interface + registry exist such that registering a new agent requires no change to existing agents, complementing the state-machine enforcement delivered in Plans 02 + 04. With Plans 01-04, all four phase success criteria are satisfied and the typed durable substrate is complete.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/05-SUMMARY.md` documenting the Agent/AgentContext/AgentResult contracts, the AgentRegistry API, and `buildContext(config, overrides)` so Phase 2 (Discovery) can implement its first real Agent and register it without touching foundation code.
</output>
