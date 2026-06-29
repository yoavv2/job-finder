import type { z } from 'zod';

/**
 * The provider-agnostic LLM seam.
 *
 * Agents (Matching/Resume) import ONLY from this module — never from the
 * Vercel AI SDK or any `@ai-sdk/*` package directly. Concrete providers live in
 * `./openai.ts` / `./anthropic.ts` and are selected purely by config through
 * `./factory.ts`. Keeping this interface narrow and vendor-neutral is what makes
 * "swap the provider in config, change no other code" actually true (Pitfall #12
 * — interface leaks). No OpenAI/Anthropic-specific field names appear here.
 */

/**
 * Token accounting, normalized across providers. Each concrete implementation
 * maps its vendor-specific usage fields onto these neutral names so callers see
 * one shape regardless of provider. Fields are optional because not every
 * provider/response reports usage.
 */
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * A plain text-completion request. `prompt` carries the user/content payload;
 * any already-sanitized + delimited untrusted text (see `./sanitize.ts`) should
 * be embedded here, with the matching guard instruction placed in `system`.
 */
export interface CompleteRequest {
  system?: string;
  prompt: string;
  /** 0 = deterministic; higher = more random. Defaults are provider-chosen. */
  temperature?: number;
}

/**
 * A structured-output request. The caller supplies a Zod schema describing the
 * exact shape it expects; the provider validates the model's output against it
 * and returns typed `data`. A response that fails the schema throws `LLMError`
 * rather than being silently used (Pitfalls #3/#7).
 */
export interface StructuredRequest<T> {
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
}

/**
 * The stable contract every concrete provider satisfies. Intentionally generic:
 * domain operations (scoreJob, tailorResume, ...) are NOT methods here. Agents
 * call `completeStructured` with their own Zod schemas, keeping this interface
 * free of any single agent's concerns.
 */
export interface LLMProvider {
  /** Stable identifier, e.g. "openai" / "anthropic" — for logging/telemetry. */
  readonly id: string;
  complete(req: CompleteRequest): Promise<{ text: string; usage?: Usage }>;
  completeStructured<T>(
    req: StructuredRequest<T>,
  ): Promise<{ data: T; usage?: Usage }>;
}

/**
 * The single error type agents see for any LLM failure — vendor SDK errors,
 * schema-validation failures, and missing-key errors are all normalized into
 * this. `cause` preserves the underlying error for diagnostics.
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
