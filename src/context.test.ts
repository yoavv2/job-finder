import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from './config/load.js';
import type { Logger } from './agents/agent.js';
import type { LLMProvider } from './llm/provider.js';
import { buildContext } from './context.js';

/** A fake LLM provider so the test never constructs a real provider/reads keys. */
const fakeLlm: LLMProvider = {
  id: 'fake',
  async complete() {
    return { text: 'fake' };
  },
  async completeStructured<T>() {
    return { data: undefined as T };
  },
};

/** A no-op logger spy so context construction stays quiet + assertable. */
function makeLogger(): Logger {
  const logger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return logger;
}

describe('buildContext', () => {
  let dir: string;
  let config: Config;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'job-finder-context-'));
    config = {
      schedule: { discovery: '0 * * * *', matching: '0 * * * *', resume: '0 * * * *' },
      filters: { keywords: [], countries: [], seniority: [] },
      minimumMatchScore: 50,
      llm: { provider: 'openai', model: 'gpt-4o-mini' },
      database: { path: join(dir, 'test.db') },
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns a fully-shaped AgentContext with injected clock + logger + llm', () => {
    const fixedNow = new Date('2026-06-29T12:00:00.000Z');
    const logger = makeLogger();
    const ctx = buildContext(config, { now: () => fixedNow, logger, llm: fakeLlm });

    expect(ctx.config).toBe(config);
    expect(ctx.llm).toBe(fakeLlm);
    expect(ctx.logger).toBe(logger);
    expect(ctx.now()).toEqual(fixedNow);
    expect(typeof ctx.jobs.insertNew).toBe('function');
    expect(typeof ctx.companies).toBe('object');
    expect(typeof ctx.applications).toBe('object');
  });

  it('wires LIVE repositories: a job written through ctx.jobs reads back', () => {
    const logger = makeLogger();
    const ctx = buildContext(config, { logger, llm: fakeLlm });

    const created = ctx.jobs.insertNew({
      title: 'Staff Engineer',
      source: 'greenhouse',
      externalId: 'gh-ctx-1',
    });

    const readBack = ctx.jobs.getById(created.id);
    expect(readBack?.id).toBe(created.id);
    expect(readBack?.title).toBe('Staff Engineer');
    expect(readBack?.status).toBe('NEW');
  });

  it('defaults now() to a real Date when not injected', () => {
    const ctx = buildContext(config, { logger: makeLogger(), llm: fakeLlm });
    expect(ctx.now()).toBeInstanceOf(Date);
  });
});
