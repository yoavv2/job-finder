---
phase: 01-foundations
plan: 05
subsystem: api
tags: [agent, registry, dependency-injection, pino, plugin-architecture]

# Dependency graph
requires:
  - phase: 01-foundations
    provides: "Config + loadConfig (Plan 01), createLLMProvider + LLMProvider (Plan 03), buildRepositories + repository classes + createDbFromConfig (Plan 04)"
provides:
  - "Agent / AgentContext / AgentResult contracts (src/agents/agent.ts) — the seam every future agent implements"
  - "AgentRegistry (src/agents/registry.ts) — Map-based open/closed register/get/list with dup + unknown guards"
  - "buildContext(config, overrides) (src/context.ts) — manual DI wiring repos + llm + config + logger + injected clock into one AgentContext"
  - "Narrow Logger type so context is decoupled from pino's full surface"
affects: [02-discovery, 03-matching, 04-resume, scheduler]

# Tech tracking
tech-stack:
  added: [pino ^10, pino-pretty (dev)]
  patterns:
    - "Plugin core (ARCHITECTURE.md pattern 1): name->instance registry, open/closed"
    - "Manual DI via context (pattern 6): no framework, buildContext wires everything"
    - "Injected clock (now) + swappable logger for deterministic, quiet tests"

key-files:
  created:
    - src/agents/agent.ts
    - src/agents/registry.ts
    - src/agents/registry.test.ts
    - src/context.ts
    - src/context.test.ts
  modified:
    - package.json

key-decisions:
  - "Narrow Logger type (info/warn/error/child) instead of importing pino's full type — context stays vendor-neutral, pino backs it only inside buildContext"
  - "buildContext takes overrides {now, logger, llm, db} so tests run offline/deterministic without real provider construction or API keys"
  - "No god base class for agents (anti-pattern #5) — Agent is a bare interface; registry only stores/resolves"

patterns-established:
  - "Open/closed agent registration: registry.register(new XAgent()) never touches existing agents (proven by test)"
  - "Agents receive all dependencies via AgentContext; they never open a DB or construct an LLM provider themselves"

requirements-completed: [FND-07]

# Metrics
duration: 4min
completed: 2026-06-29
---

# Phase 1 Plan 05: Agent Core + Context Wiring Summary

**Unified Agent/AgentContext/AgentResult contracts, a Map-based open/closed AgentRegistry, and buildContext(config, overrides) that wires Plan 01/03/04 (config + LLM provider + live repositories) plus a pino-backed logger and injected clock into the single context every future agent's run() receives.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-29T14:20:30Z
- **Completed:** 2026-06-29T14:24:34Z
- **Tasks:** 3
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- Defined the extension seam (`Agent`, `AgentContext`, `AgentResult`, narrow `Logger`) that Phases 2-4 plug into without touching foundation code.
- Built and tested an open/closed `AgentRegistry` (register/get/list, dup + unknown guards) — two distinct agents register independently.
- Implemented `buildContext` composing live repositories, the config-selected LLM provider, a pino logger, and an injectable clock; proven live via a job written through `ctx.jobs` and read back.
- Completed Phase 1 success criterion #3 (agent contract + registry) — full suite 93/93 green, typecheck clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Agent/AgentContext/AgentResult contracts** - `83f70b0` (feat)
2. **Task 2: AgentRegistry (TDD)** - `8ca53aa` (test, RED) → `7e261ea` (feat, GREEN)
3. **Task 3: buildContext (TDD)** - `7dd96fe` (test + pino install, RED) → `01c89e8` (feat, GREEN)

**Plan metadata:** see final docs commit.

## Files Created/Modified
- `src/agents/agent.ts` - Agent, AgentContext, AgentResult, narrow Logger contracts (types only)
- `src/agents/registry.ts` - Map-based AgentRegistry (register/get/list, dup + unknown guards)
- `src/agents/registry.test.ts` - register/get/list, guard, and open/closed proof tests
- `src/context.ts` - buildContext(config, overrides) manual DI wiring
- `src/context.test.ts` - context shape, override, and live-DB read-back tests
- `package.json` - added pino (^10) + pino-pretty (dev)

## Decisions Made
- Used a narrow `Logger` type (info/warn/error/child) so `AgentContext` is not coupled to pino's full surface; pino backs it only inside `buildContext` (cast at the boundary).
- `buildContext` accepts `{now, logger, llm, db}` overrides so tests are deterministic and offline (no real provider construction / API keys).
- Kept `Agent` as a bare interface (no god base class, anti-pattern #5); the registry is the only shared machinery.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Pino's logger structurally satisfies the narrow `Logger` interface; a single boundary cast in `buildContext` keeps the rest of the codebase pino-agnostic.

## User Setup Required
None - no external service configuration required. (LLM provider construction is config-selected and key-reading happens only when the provider is built in production; tests inject a fake provider.)

## Next Phase Readiness
- Phase 2 (Job Discovery) can implement its first real Agent and call `registry.register(new DiscoveryAgent())` with zero changes to foundation code.
- Agents obtain all dependencies from `AgentContext`; a phase entrypoint calls `buildContext(loadConfig())` once and passes the context to `agent.run(ctx)`.
- All four Phase 1 success criteria are satisfied; the typed durable substrate is complete.

## Self-Check: PASSED

All 5 created files exist; all 5 task commits (`83f70b0`, `8ca53aa`, `7e261ea`, `7dd96fe`, `01c89e8`) verified in git history.

---
*Phase: 01-foundations*
*Completed: 2026-06-29*
