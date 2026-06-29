# Deferred Items — Phase 01 Foundations

Out-of-scope discoveries logged during plan execution. NOT fixed here.

## From Plan 03 (LLM layer)

- **Pre-existing broken typecheck: `src/db/status.test.ts`**
  - Found during: Plan 03, Task 1 (`pnpm typecheck`).
  - Issue: An untracked test file `src/db/status.test.ts` imports `./status.js`, which does not exist. This causes `pnpm typecheck` (whole-project `tsc --noEmit`) to fail with `TS2307`.
  - Why deferred: Not created by Plan 03 and unrelated to the LLM layer (belongs to a DB plan, e.g. 01-02). Out of scope per executor scope boundary.
  - Action needed: The owning DB plan should add `src/db/status.ts` (or the test should be removed/relocated). Plan 03 verifies its own files typecheck in isolation to avoid being blocked by this.
