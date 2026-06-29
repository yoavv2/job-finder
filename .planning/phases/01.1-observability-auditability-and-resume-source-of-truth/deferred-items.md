# Deferred Items — Phase 01.1

Out-of-scope discoveries logged during execution. NOT fixed by the discovering plan.

## From Plan 01.1-01 (2026-06-29)

- **Pre-existing test failure in `src/resume/load.test.ts`** (untracked files, belong to a later plan in this phase — resume source-of-truth). Test: `loadResume > reads structured YAML only — the module imports no PDF parser` fails at line 53. These `src/resume/*` files are not part of Plan 01.1-01 (historical-data schema) and were already present (untracked) before execution. Out of scope; to be addressed by the owning resume plan.
