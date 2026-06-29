import type {
  ApplicationRepository,
  CompanyRepository,
  JobRepository,
} from '../db/repositories/index.js';
import type { LLMProvider } from '../llm/provider.js';
import type { Config } from '../config/load.js';

/**
 * The plugin core (ARCHITECTURE.md patterns 1 + 6).
 *
 * This file is the contract EVERY agent imports. It is intentionally
 * dependency-light (types only): the `Agent` interface, the `AgentContext`
 * dependency bundle, the `AgentResult` report shape, and a narrow `Logger`
 * type. No concrete implementation, no DI framework, no god base class
 * (anti-pattern #5) — new agents plug in by implementing `Agent` and
 * registering, never by editing existing agents.
 */

/**
 * A minimal structured-logging surface (a subset of pino's API) so
 * `AgentContext` depends on this narrow type rather than pino's full surface.
 * `buildContext` backs it with pino; tests can inject a no-op/spy.
 */
export interface Logger {
  info(o: unknown, msg?: string): void;
  warn(o: unknown, msg?: string): void;
  error(o: unknown, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * The bundle of injected dependencies an agent's `run()` receives. Dependency
 * injection via this context (pattern 6) keeps agents free of construction
 * concerns and makes them deterministic + quiet in tests: `now` is an injected
 * clock and `logger` is swappable.
 */
export interface AgentContext {
  jobs: JobRepository;
  companies: CompanyRepository;
  applications: ApplicationRepository;
  llm: LLMProvider;
  config: Config;
  logger: Logger;
  /** Injected clock — agents call `now()` instead of `new Date()` so tests are deterministic. */
  now: () => Date;
}

/**
 * The normalized report an agent returns from a `run()`. Counts let the
 * scheduler/telemetry summarize a pass without knowing agent-specific detail.
 */
export interface AgentResult {
  agent: string;
  processed: number;
  succeeded: number;
  failed: number;
  notes?: string;
}

/**
 * The unified agent contract. Every Phase 2-4 agent (Discovery, Matching,
 * Resume) implements exactly this: a stable `name` and a single `run(ctx)`
 * that does one pass over its work and returns an {@link AgentResult}.
 */
export interface Agent {
  readonly name: string;
  run(ctx: AgentContext): Promise<AgentResult>;
}
