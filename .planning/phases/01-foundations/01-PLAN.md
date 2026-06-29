---
phase: 01-foundations
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - .gitignore
  - .env.example
  - config.example.yaml
  - config.yaml
  - src/config/schema.ts
  - src/config/load.ts
  - src/config/load.test.ts
autonomous: true
requirements: [FND-01, FND-02, FND-03]
must_haves:
  truths:
    - "Running the app with a valid config.yaml loads typed settings (schedule, filters, keywords, countries, minimumMatchScore, llm.provider, llm.model)"
    - "Running the app with an invalid config.yaml fails fast at startup with a readable error naming the offending field"
    - "LLM API keys are read from process.env (.env), never from config.yaml or source"
    - ".env, *.db, *.db-wal, *.db-shm, and generated output dirs are gitignored and never committed"
  artifacts:
    - path: "src/config/schema.ts"
      provides: "Zod schema + inferred Config type for the entire YAML contract"
      contains: "z.object"
    - path: "src/config/load.ts"
      provides: "loadConfig(): parse YAML -> Zod safeParse -> freeze -> return typed Config; throws clear error on invalid"
      exports: ["loadConfig", "Config"]
    - path: ".gitignore"
      provides: "Secrets and local artifacts excluded from git"
      contains: ".env"
    - path: ".env.example"
      provides: "Documented placeholder env vars for LLM keys"
  key_links:
    - from: "src/config/load.ts"
      to: "src/config/schema.ts"
      via: "import ConfigSchema and safeParse the parsed YAML against it"
      pattern: "ConfigSchema\\.safeParse"
    - from: "src/config/load.ts"
      to: "process.env"
      via: "secrets resolved from env, not from the YAML object"
      pattern: "process\\.env"
---

<objective>
Stand up the project's typed configuration substrate: a TypeScript/ESM project skeleton, a single Zod schema describing the entire YAML config contract, a loader that parses YAML, validates it (failing fast with a clear error), and a strict secrets boundary where LLM API keys come from `.env` (gitignored) — never from tracked config or source.

Purpose: Every other plan in this phase (DB, LLM, agents) depends on a typed, validated `Config` object and a safe place for secrets. This is the root of the dependency graph.
Output: Working `loadConfig()` returning a frozen, typed `Config`; a Zod schema as the single source of truth; project tooling (package.json, tsconfig, .gitignore, .env.example).
</objective>

<execution_context>
@/Users/yoavhevroni/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yoavhevroni/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/research/STACK.md
@.planning/research/PITFALLS.md

This is a greenfield repo (only `.planning/` and `.git/` exist). No package.json, no source, no .gitignore yet.

Stack decisions (from STACK.md — locked):
- Package manager: pnpm. TypeScript `^5.9` strict, ESM (`"type": "module"`), Node `>=22`.
- Config parsing: `yaml` package (`^2.9`) — NOT js-yaml.
- Validation: Zod `^4`.
- Dev/run: `tsx` (dev), test runner: Vitest.
- Secrets pitfall (PITFALLS.md #10): keys NEVER in YAML/source; only env/.env; .gitignore must cover `.env`, `*.db`, `*.db-wal`, generated PDFs from the first commit.

Config contract the YAML must express (from FND-01 + FEATURES.md):
- `schedule` (cron-ish strings per agent, e.g. discovery/matching/resume)
- `filters`: `keywords` (string[]), `countries`/`locations` (string[]), `seniority` (string[])
- `minimumMatchScore` (number 0-100)
- `llm`: `provider` (enum: "openai" | "anthropic"), `model` (string)
- `database`: `path` (string, e.g. "./data/jobs.db")
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold the TypeScript/ESM project and secrets boundary</name>
  <files>package.json, tsconfig.json, .gitignore, .env.example</files>
  <action>
    Initialize a pnpm TypeScript ESM project.

    package.json:
    - `"type": "module"`, `"packageManager": "pnpm@..."`, `"engines": { "node": ">=22" }`
    - Scripts: `"dev": "tsx"`, `"test": "vitest run"`, `"test:watch": "vitest", "typecheck": "tsc --noEmit"`
    - Install runtime deps: `pnpm add zod yaml` (pin zod ^4, yaml ^2.9). Do NOT add the LLM/DB/etc deps here — later plans add what they need; but it's fine if a later plan installs them.
    - Install dev deps: `pnpm add -D typescript tsx vitest @types/node`

    tsconfig.json: strict, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2022"`, `"strict": true`, `"esModuleInterop": true`, `"skipLibCheck": true`, `"noEmit": true`, `"rootDir": "src"`. Include `src/**/*`.

    .gitignore (create — none exists): must include `node_modules/`, `.env`, `*.db`, `*.db-wal`, `*.db-shm`, `dist/`, `output/`, `*.pdf`, `data/`. (Secrets pitfall — these MUST be excluded from the very first commit.)

    .env.example: documented placeholders, e.g.
      `OPENAI_API_KEY=sk-...`
      `ANTHROPIC_API_KEY=sk-ant-...`
    (No real keys. `.env.example` IS tracked; `.env` is NOT.)
  </action>
  <verify>
    <automated>node -e "const p=require('./package.json'); if(p.type!=='module') throw new Error('not ESM'); if(!p.scripts.test) throw new Error('no test script')" && grep -q '^\.env$' .gitignore && grep -q '\*.db' .gitignore && test -f .env.example</automated>
  </verify>
  <done>pnpm project initialized as ESM strict TS; `.gitignore` excludes `.env`/`*.db`/`*.db-wal`/output; `.env.example` documents LLM key placeholders; zod + yaml installed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Define the config Zod schema and a fail-fast loader</name>
  <files>src/config/schema.ts, src/config/load.ts, src/config/load.test.ts, config.example.yaml, config.yaml</files>
  <behavior>
    - Valid config.yaml -> loadConfig() returns a typed object with schedule, filters.keywords, filters.countries, filters.seniority, minimumMatchScore, llm.provider, llm.model, database.path.
    - minimumMatchScore outside 0-100 -> loadConfig() throws an Error whose message names `minimumMatchScore`.
    - llm.provider not in the allowed enum -> throws naming `llm.provider`.
    - Missing required field (e.g. omit `database`) -> throws naming the missing path.
    - The returned object is frozen (Object.isFrozen === true) so callers can't mutate config at runtime.
  </behavior>
  <action>
    src/config/schema.ts: Export `ConfigSchema = z.object({...})` covering the full contract (see <context>). Use:
      - `llm: z.object({ provider: z.enum(['openai','anthropic']), model: z.string().min(1) })`
      - `minimumMatchScore: z.number().int().min(0).max(100)`
      - `filters: z.object({ keywords: z.array(z.string()), countries: z.array(z.string()), seniority: z.array(z.string()) })`
      - `schedule: z.object({ discovery: z.string(), matching: z.string(), resume: z.string() })` (cron strings; keep as strings)
      - `database: z.object({ path: z.string().min(1) })`
    Export `export type Config = z.infer<typeof ConfigSchema>;` — this inferred type is the single source of truth consumed by every later plan.
    Do NOT put any secret (API key) field in the schema — secrets come from env only.

    src/config/load.ts: `export function loadConfig(path = process.env.CONFIG_PATH ?? 'config.yaml'): Config`:
      - read file, `parse` with the `yaml` package
      - `ConfigSchema.safeParse(parsed)`; on failure throw `new Error('Invalid config: ' + formatted issues)` where formatted issues join `issue.path.join('.') + ': ' + issue.message` (so the error names the offending field)
      - on success `Object.freeze(result.data)` and return it
    Also export a helper `getEnv(name: string): string` that reads `process.env[name]` and throws a clear error if missing — the LLM plan will use this to fetch keys. Keep secret access centralized here.

    config.example.yaml: a complete, valid example (tracked) with placeholder values matching the schema. config.yaml: a working local copy (gitignored? NO — config.yaml has no secrets so it may be tracked; keep config.yaml as the real local config with non-secret values). Make config.yaml a valid config so the app runs.

    src/config/load.test.ts (Vitest): cover the behaviors above by writing temp YAML files (or passing inline parsed objects to a `validateConfig(obj)` you also export from schema.ts for direct testing). Assert thrown error messages contain the offending field name; assert frozen.
  </action>
  <verify>
    <automated>pnpm test -- src/config/load.test.ts && pnpm typecheck</automated>
  </verify>
  <done>loadConfig() returns a frozen typed Config for valid YAML and throws a field-naming error for invalid YAML; `Config` type exported from schema.ts; example + working config.yaml exist; tests + typecheck pass.</done>
</task>

</tasks>

<verification>
- `pnpm test` passes (config tests green).
- `pnpm typecheck` clean.
- `.env` is gitignored (`git check-ignore .env` succeeds); `git status` shows no `.env` or `*.db` tracked.
- No API key string appears in any tracked file (`config.yaml`/`config.example.yaml` contain only provider name + model, never a key).
</verification>

<success_criteria>
Phase 1 success criterion #1 is fully met: app loads all settings from a YAML config validated by a Zod schema, fails fast with a clear error on invalid config, reads LLM API keys from a gitignored `.env`, with no hardcoded values.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-SUMMARY.md` documenting the `Config` type shape, `loadConfig`/`getEnv` exports, and the config.yaml contract so downstream plans can rely on it.
</output>
