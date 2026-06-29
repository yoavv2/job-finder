import { pino } from 'pino';
import type { Config } from './config/load.js';
import { createDbFromConfig, type Database } from './db/client.js';
import { buildRepositories } from './db/repositories/index.js';
import { createLLMProvider } from './llm/factory.js';
import type { LLMProvider } from './llm/provider.js';
import type { AgentContext, Logger } from './agents/agent.js';

/**
 * Overrides that make {@link buildContext} deterministic and offline in tests
 * (ARCHITECTURE.md pattern 6 — manual DI, no framework):
 * - `now`    pins the clock so time-dependent agents are testable.
 * - `logger` swaps in a no-op/spy so tests stay quiet + assertable.
 * - `llm`    injects a fake provider so tests never construct a real provider
 *            (which would require API keys); production omits it and the
 *            config-selected provider is built via {@link createLLMProvider}.
 * - `db`     injects an already-open handle so a test can reuse a DB; production
 *            omits it and the DB is opened from `config.database.path`.
 */
export interface BuildContextOverrides {
  now?: () => Date;
  logger?: Logger;
  llm?: LLMProvider;
  db?: Database;
}

/**
 * Wire the foundation pieces (Plans 01/03/04) into the single
 * {@link AgentContext} every agent's `run()` receives:
 * - opens the DB from config (`createDbFromConfig`) and builds repositories
 *   (`buildRepositories`) — the live DB access surface;
 * - selects the LLM provider purely from `config.llm.provider`
 *   (`createLLMProvider`);
 * - backs the narrow {@link Logger} with pino;
 * - injects a clock (`now`).
 *
 * This is the only place these foundation factories are composed — agents never
 * open a DB or construct a provider themselves.
 */
export function buildContext(
  config: Config,
  overrides?: BuildContextOverrides,
): AgentContext {
  const handle = overrides?.db ?? createDbFromConfig(config);
  const repos = buildRepositories(handle);

  const llm = overrides?.llm ?? createLLMProvider(config);
  const logger = overrides?.logger ?? (pino() as unknown as Logger);
  const now = overrides?.now ?? (() => new Date());

  return {
    jobs: repos.jobs,
    companies: repos.companies,
    applications: repos.applications,
    llm,
    config,
    logger,
    now,
  };
}
