---
phase: 01-foundations
plan: 01
subsystem: config
tags: [typescript, esm, pnpm, zod, yaml, vitest, tsx, config, secrets]

# Dependency graph
requires: []
provides:
  - "TypeScript/ESM project skeleton (pnpm, strict NodeNext, Node >=22)"
  - "ConfigSchema (Zod) — single source of truth for the YAML config contract"
  - "Config type (z.infer<typeof ConfigSchema>) consumed by all downstream plans"
  - "loadConfig(path): parse YAML -> validate -> freeze -> typed Config (fails fast)"
  - "getEnv(name): centralized required-secret access from process.env (.env)"
  - "Secrets boundary: .env gitignored; keys never in YAML or source"
  - "Test infrastructure: Vitest configured and green"
affects: [database, llm, agents, discovery, matching, resume, scheduler]

# Tech tracking
tech-stack:
  added: [zod@^4, yaml@^2.9, typescript, tsx, vitest, "@types/node"]
  patterns:
    - "Zod schema as single source of truth; types via z.infer"
    - "Fail-fast config validation with field-naming error messages"
    - "Frozen config object (Object.freeze) prevents runtime mutation"
    - "Centralized secret access via getEnv() reading process.env only"
    - "TDD: failing test committed before implementation"

key-files:
  created:
    - src/config/schema.ts
    - src/config/load.ts
    - src/config/load.test.ts
    - config.example.yaml
    - config.yaml
    - package.json
    - tsconfig.json
    - .gitignore
    - .env.example
  modified: []

key-decisions:
  - "Used corepack pnpm@9.15.4 instead of system pnpm 7.27.1 (ERR_INVALID_THIS on Node 22)"
  - "Ran tooling under Node 22.22.0 (nvm) to satisfy engines node>=22; system default was Node 19"
  - "Exported validateConfig(obj) from schema.ts for direct/in-memory validation and testing"
  - "config.yaml is tracked (contains no secrets); only .env is gitignored"

patterns-established:
  - "Config: single Zod schema -> z.infer Config type -> loadConfig freezes result"
  - "Secrets: getEnv(name) is the only sanctioned secret read path (env/.env, never YAML)"

requirements-completed: [FND-01, FND-02, FND-03]

# Metrics
duration: 5min
completed: 2026-06-29
---

# Phase 1 Plan 01: Typed Config Substrate Summary

**Typed, fail-fast configuration: a single Zod schema (`ConfigSchema`) drives `loadConfig()` (YAML parse -> validate -> freeze -> typed `Config`), with LLM keys read only from a gitignored `.env` via `getEnv()`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-29T13:08:29Z
- **Completed:** 2026-06-29T13:13:30Z
- **Tasks:** 2
- **Files modified:** 9 created (10 incl. pnpm-lock.yaml)

## Accomplishments

- Scaffolded a strict TypeScript ESM project (pnpm, NodeNext, Node >=22) with dev/test/typecheck scripts.
- Established the secrets boundary from the first commit: `.gitignore` excludes `.env`, `*.db`, `*.db-wal/-shm`, `dist/`, `output/`, `data/`, `*.pdf`; `.env.example` documents key placeholders.
- Authored `ConfigSchema` (Zod) as the single source of truth covering `schedule`, `filters`, `minimumMatchScore`, `llm`, and `database`, with the inferred `Config` type exported for all downstream plans.
- Implemented `loadConfig()` (parse YAML -> `safeParse` -> field-naming error on failure -> `Object.freeze`) and `getEnv()` for centralized required-secret access.
- 9/9 Vitest tests green; `tsc --noEmit` clean.

## Config Contract (for downstream plans)

`import { loadConfig, getEnv, type Config } from './config/load.js';`

```ts
type Config = {
  schedule: { discovery: string; matching: string; resume: string };
  filters: { keywords: string[]; countries: string[]; seniority: string[] };
  minimumMatchScore: number; // int 0-100
  llm: { provider: 'openai' | 'anthropic'; model: string };
  database: { path: string };
};
```

- `loadConfig(path = process.env.CONFIG_PATH ?? 'config.yaml'): Config` — returns a **frozen** typed object; throws `Error('Invalid config: <field>: <message>; ...')` naming each offending field path on invalid YAML.
- `validateConfig(obj: unknown): Config` (exported from `schema.ts`) — validate an already-parsed object directly.
- `getEnv(name: string): string` — read a required env var (e.g. `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`); throws a clear error if unset. **The only sanctioned secret-read path.** Never put keys in `config.yaml` or source.

## Task Commits

1. **Task 1: Scaffold TS/ESM project + secrets boundary** - `8650b5e` (chore)
2. **Task 2 (RED): failing config schema/loader tests** - `2c493b9` (test)
3. **Task 2 (GREEN): config Zod schema + fail-fast loader** - `66a3711` (feat)

_TDD task 2 split into test (RED) then feat (GREEN); no refactor commit needed._

## Files Created/Modified

- `package.json` - pnpm ESM project; engines node>=22; dev/test/typecheck scripts; zod, yaml + dev tooling.
- `tsconfig.json` - strict NodeNext, target ES2022, rootDir src, noEmit, `types:[node]`.
- `.gitignore` - excludes `.env`, `*.db`, `*.db-wal/-shm`, `dist/`, `output/`, `data/`, `*.pdf`.
- `.env.example` - documented OPENAI/ANTHROPIC key placeholders (tracked; `.env` is not).
- `src/config/schema.ts` - `ConfigSchema`, `Config` type, `validateConfig()`.
- `src/config/load.ts` - `loadConfig()`, `getEnv()`.
- `src/config/load.test.ts` - Vitest coverage of valid/invalid/frozen/env behaviors.
- `config.example.yaml` / `config.yaml` - complete valid config; no secrets.

## Decisions Made

- **pnpm version:** System pnpm 7.27.1 throws `ERR_INVALID_THIS` under Node 22's fetch. Pinned `packageManager: pnpm@9.15.4` and used corepack to run it.
- **Node version:** System default is Node 19 (EOL) but `engines` requires `>=22`. Ran all tooling under Node 22.22.0 (available via nvm). Downstream plans should use the same.
- **validateConfig export:** Added a direct-object validator (per plan suggestion) so callers/tests can validate parsed objects without touching the filesystem.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched to corepack pnpm@9.15.4 on Node 22**
- **Found during:** Task 1 (dependency install)
- **Issue:** System pnpm 7.27.1 failed with `ERR_INVALID_THIS` (incompatible with Node 22's fetch API), blocking all installs.
- **Fix:** Set `packageManager: pnpm@9.15.4` in package.json and ran installs via `corepack pnpm`; executed tooling under Node 22.22.0.
- **Files modified:** package.json
- **Verification:** `corepack pnpm add ...` installed zod@4.4.3 + yaml@2.9.0 and dev deps successfully.
- **Committed in:** `8650b5e` (Task 1 commit)

**2. [Rule 3 - Blocking] Added `types:[node]` to tsconfig**
- **Found during:** Task 2 (typecheck)
- **Issue:** `tsc --noEmit` failed (`TS2591`: cannot find `process`, `node:fs`, etc.) — `@types/node` installed but not resolved under NodeNext without an explicit `types` entry.
- **Fix:** Added `"types": ["node"]` to tsconfig compilerOptions.
- **Files modified:** tsconfig.json
- **Verification:** `pnpm typecheck` now clean; tests still 9/9 green.
- **Committed in:** `66a3711` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking).
**Impact on plan:** Both fixes were environment/tooling necessities required to install deps and pass typecheck. No scope creep; the config contract was implemented exactly as specified.

## Issues Encountered

- Environment toolchain mismatch (Node 19 system default vs Node 22 requirement; old pnpm). Resolved by using nvm's Node 22.22.0 + corepack pnpm 9. Documented above so downstream plans use the same toolchain.

## User Setup Required

None for this plan's automated verification. Before running the live app, users copy `.env.example` to `.env` and set the API key for their configured `llm.provider`.

## Next Phase Readiness

- A frozen, typed `Config` and a safe secret-access path (`getEnv`) are available — the root dependency for the DB, LLM, and agent plans is in place.
- **Toolchain note for downstream plans:** use Node >=22 (e.g. nvm `v22.22.0`) and `corepack pnpm` (pnpm 9); system pnpm 7 + Node 19 will fail.

## Self-Check: PASSED

All 10 claimed files exist on disk; all 3 task commits (`8650b5e`, `2c493b9`, `66a3711`) present in git history.

---
*Phase: 01-foundations*
*Completed: 2026-06-29*
