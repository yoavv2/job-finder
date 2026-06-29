---
phase: 01-foundations
plan: 03
subsystem: api
tags: [llm, vercel-ai-sdk, openai, anthropic, zod, prompt-injection, structured-output]

# Dependency graph
requires:
  - phase: 01-foundations (Plan 01)
    provides: "Config type, config.llm.provider/model, getEnv() centralized secret access"
provides:
  - "Provider-neutral LLMProvider interface (complete + completeStructured) — agents import only src/llm/provider.ts"
  - "createLLMProvider(config): config-driven OpenAI/Anthropic selection with env-sourced keys"
  - "Neutral request/response types: CompleteRequest, StructuredRequest<T>, Usage, LLMError"
  - "Zod-schema-validated structured output (malformed -> LLMError)"
  - "sanitizeUntrusted()/wrapUntrusted() untrusted-input handling for job-description text"
  - "Contract tests proving both providers satisfy one interface (leak detector)"
affects: [03-matching, 04-resume]

# Tech tracking
tech-stack:
  added: ["ai ^7 (Vercel AI SDK)", "@ai-sdk/openai", "@ai-sdk/anthropic"]
  patterns:
    - "Anti-corruption seam: vendor SDKs confined to openai.ts/anthropic.ts/factory.ts; agents import only provider.ts"
    - "Config-driven provider selection (no code change to swap provider)"
    - "Defense-by-delimiting for prompt injection (fence + schema-validate, never scrub words)"
    - "Independent schema re-validation of structured output (schema is the contract)"

key-files:
  created:
    - src/llm/provider.ts
    - src/llm/sanitize.ts
    - src/llm/sanitize.test.ts
    - src/llm/openai.ts
    - src/llm/anthropic.ts
    - src/llm/factory.ts
    - src/llm/factory.test.ts
    - src/llm/contract.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Used createOpenAI/createAnthropic({ apiKey })(model) to inject keys explicitly rather than relying on env-implicit SDK globals"
  - "completeStructured independently re-validates result.object against the caller Zod schema — does not blindly trust the SDK's own validation"
  - "Accepted ai ^7 (plan said ^5): v7 generateText/generateObject are API-compatible and already use neutral inputTokens/outputTokens; zod ^4 peer satisfied"

patterns-established:
  - "LLM anti-corruption layer: one narrow interface, swappable concrete providers, contract test as leak detector"
  - "Untrusted external text is sanitized + fenced before prompting; never scrubbed of 'instructions'"

requirements-completed: [LLM-01, LLM-02, LLM-03, LLM-04]

# Metrics
duration: 17min
completed: 2026-06-29
---

# Phase 1 Plan 03: Provider-Agnostic LLM Layer Summary

**Narrow `LLMProvider` seam with OpenAI + Anthropic implementations swappable purely via `llm.provider` config, Zod-validated structured output (malformed -> LLMError), and a delimit-not-delete untrusted-input sanitizer for job-description text — proven by a both-providers contract test.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-06-29T10:35:00Z
- **Completed:** 2026-06-29T10:52:13Z
- **Tasks:** 3 (2 via TDD)
- **Files created:** 8 (3 source, 3 test, 2 vendor source)
- **Files modified:** 2 (package.json, pnpm-lock.yaml)

## Accomplishments

- Defined a narrow, vendor-neutral `LLMProvider` interface (`complete` + `completeStructured`) plus neutral `Usage`, `CompleteRequest`, `StructuredRequest<T>`, and an `LLMError` taxonomy. Agents import only `src/llm/provider.ts`.
- Built two concrete providers (`createOpenAIProvider`, `createAnthropicProvider`) on the Vercel AI SDK; vendor SDKs are confined to `openai.ts`/`anthropic.ts`/`factory.ts`.
- `createLLMProvider(config)` selects the implementation by `config.llm.provider` alone and reads keys via `getEnv()` in the factory only (missing key -> `LLMError`).
- Structured output is re-validated against the caller's Zod schema; malformed output throws `LLMError` instead of being silently used.
- `sanitizeUntrusted` (strips HTML, decodes entities, removes zero-width chars, collapses whitespace) and `wrapUntrusted` (delimited fences) handle untrusted JD text by delimiting, not deleting.
- Contract test runs identical assertions against both providers (the interface-leak detector); all 27 LLM tests pass.

## Task Commits

1. **Task 1: Define provider-neutral LLMProvider interface + types** — `d213c96` (feat)
2. **Task 2 (TDD): Untrusted-input sanitizer** — `1dbddf6` (test, RED) -> `5c56614` (feat, GREEN)
3. **Task 3 (TDD): OpenAI + Anthropic providers, config factory, contract tests** — `7da500b` (test, RED) -> `05f8064` (feat, GREEN)

_No refactor commits needed; GREEN implementations were clean._

## Files Created/Modified

- `src/llm/provider.ts` — Narrow `LLMProvider` interface + neutral `Usage`/`CompleteRequest`/`StructuredRequest<T>`/`LLMError` (imports only `zod` type).
- `src/llm/sanitize.ts` — `sanitizeUntrusted()` + `wrapUntrusted()` untrusted-text handling.
- `src/llm/sanitize.test.ts` — 11 tests covering invisible-char/HTML/entity/whitespace handling and injection fencing.
- `src/llm/openai.ts` — `createOpenAIProvider()` over AI SDK `generateText`/`generateObject`, neutral return shapes.
- `src/llm/anthropic.ts` — `createAnthropicProvider()`, identical neutral shapes.
- `src/llm/factory.ts` — `createLLMProvider(config)` config-driven selection; keys via `getEnv()` here only.
- `src/llm/factory.test.ts` — 6 tests: provider selection per config, missing-key error, unknown provider, structured roundtrip.
- `src/llm/contract.test.ts` — 10 tests (5 x 2 providers): shape conformance, neutral `complete`/`completeStructured` returns, malformed -> `LLMError`, SDK error -> `LLMError`.
- `package.json` / `pnpm-lock.yaml` — added `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`.

## Decisions Made

- **Explicit key injection:** providers use `createOpenAI/createAnthropic({ apiKey })(model)` so keys flow through the factory, never via implicit SDK env globals.
- **Independent schema re-validation:** `completeStructured` re-parses `result.object` with the caller's schema rather than trusting the SDK's internal validation — the schema is the contract; this is also what makes the "malformed -> LLMError" contract test meaningful with a mocked SDK.
- **`ai` version:** the plan tracked `ai ^5`; npm resolved `ai ^7`. v7's `generateText`/`generateObject` are API-compatible with the planned usage and already expose neutral `inputTokens`/`outputTokens`, and its zod peer range (`^3.25.76 || ^4.1.8`) accepts the installed zod `^4.4.3`. Adopted v7 (no API change required).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ai` resolved to ^7 instead of planned ^5**
- **Found during:** Task 1 (dependency install)
- **Issue:** `pnpm add ai` installed `ai@7.0.4`; the plan tracked `ai ^5`.
- **Fix:** Verified v7 still exports `generateText`/`generateObject` with the same call shape, exposes neutral `inputTokens`/`outputTokens` usage fields, and its zod peer range accepts zod `^4.4.3`. No code change needed; adopted v7.
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `node -e import('ai')` confirms both functions exported; all 27 LLM tests + typecheck (on plan files) pass.
- **Committed in:** d213c96 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking). No scope creep.
**Impact on plan:** None functionally — all interface, factory, validation, and sanitizer behavior delivered exactly as specified.

## Issues Encountered

- **Pre-existing broken typecheck (out of scope):** `pnpm typecheck` (whole-project `tsc --noEmit`) fails on `src/db/status.test.ts` importing a then-missing `./status.js`. This file belongs to a sibling DB plan (Plan 02), not Plan 03. Per the executor scope boundary it was NOT fixed; logged to `.planning/phases/01-foundations/deferred-items.md`. Verification confirmed zero non-`src/db` typecheck errors, so all Plan 03 files typecheck clean.

## User Setup Required

None for code execution. Runtime use of a real provider requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `.env` (see `.env.example`); the factory throws a clear `LLMError` if the selected provider's key is unset. Tests mock the SDK and need no keys.

## Next Phase Readiness

- Matching (Phase 3) and Resume (Phase 4) can build agents against `src/llm/provider.ts` and call `completeStructured` with their own Zod schemas — no vendor SDK contact.
- JD text should be passed through `sanitizeUntrusted`/`wrapUntrusted` with a system instruction declaring the fenced content as data-only.
- Phase 1 success criterion #4 (provider-agnostic LLM with two impls, schema-validated structured output, sanitized untrusted input) is fully met.

---
*Phase: 01-foundations*
*Completed: 2026-06-29*
