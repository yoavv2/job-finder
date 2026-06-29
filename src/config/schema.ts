import { z } from 'zod';

/**
 * The single source of truth for the application's YAML configuration contract.
 *
 * IMPORTANT — secrets boundary: no API key / secret field appears in this
 * schema. LLM provider keys are read exclusively from `process.env` (see
 * `getEnv` in ./load.ts) and never from config.yaml or source.
 */
export const ConfigSchema = z.object({
  /** Cron-ish schedule strings per autonomous agent (kept as opaque strings). */
  schedule: z.object({
    discovery: z.string().min(1),
    matching: z.string().min(1),
    resume: z.string().min(1),
  }),
  /** Discovery/matching filters. */
  filters: z.object({
    keywords: z.array(z.string()),
    countries: z.array(z.string()),
    seniority: z.array(z.string()),
  }),
  /** Minimum match score (0-100) a job must reach to be surfaced. */
  minimumMatchScore: z.number().int().min(0).max(100),
  /** LLM provider selection. The matching API key comes from env, not here. */
  llm: z.object({
    provider: z.enum(['openai', 'anthropic']),
    model: z.string().min(1),
  }),
  /** Local SQLite database location. */
  database: z.object({
    path: z.string().min(1),
  }),
});

/**
 * The inferred, typed configuration object consumed by every downstream plan.
 * This is the single source of truth for the config shape.
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Validate an already-parsed plain object against the schema.
 *
 * On failure, throws an Error whose message names each offending field path
 * (e.g. `minimumMatchScore: ...`, `llm.provider: ...`) so misconfiguration is
 * obvious at startup. Useful for direct/in-memory validation and tests.
 */
export function validateConfig(input: unknown): Config {
  const result = ConfigSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid config: ${issues}`);
  }
  return result.data;
}
