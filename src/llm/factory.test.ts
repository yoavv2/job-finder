import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { Config } from '../config/load.js';
import { LLMError } from './provider.js';

// Mock the AI SDK so factory selection can be tested without network/keys.
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({
    text: 'ok',
    usage: { inputTokens: 1, outputTokens: 2 },
  })),
  generateObject: vi.fn(async () => ({
    object: { value: 42 },
    usage: { inputTokens: 1, outputTokens: 2 },
  })),
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => ({ model })),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (model: string) => ({ model })),
}));

import { createLLMProvider } from './factory.js';

function baseConfig(overrides: Partial<Config['llm']>): Config {
  return {
    schedule: { discovery: '* * * * *', matching: '* * * * *', resume: '* * * * *' },
    filters: { keywords: [], countries: [], seniority: [] },
    minimumMatchScore: 50,
    llm: { provider: 'openai', model: 'gpt-x', ...overrides },
    database: { path: ':memory:' },
  } as Config;
}

describe('createLLMProvider', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';
    process.env.ANTHROPIC_API_KEY = 'sk-test-anthropic';
  });

  it('selects the OpenAI provider when config.llm.provider is "openai"', () => {
    const provider = createLLMProvider(baseConfig({ provider: 'openai' }));
    expect(provider.id).toBe('openai');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.completeStructured).toBe('function');
  });

  it('selects the Anthropic provider when config.llm.provider is "anthropic"', () => {
    const provider = createLLMProvider(
      baseConfig({ provider: 'anthropic', model: 'claude-x' }),
    );
    expect(provider.id).toBe('anthropic');
  });

  it('swapping only config.llm.provider swaps the implementation (no other change)', () => {
    const a = createLLMProvider(baseConfig({ provider: 'openai' }));
    const b = createLLMProvider(baseConfig({ provider: 'anthropic', model: 'claude-x' }));
    expect(a.id).not.toBe(b.id);
  });

  it('throws LLMError when the required API key env var is missing', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => createLLMProvider(baseConfig({ provider: 'openai' }))).toThrow(
      LLMError,
    );
  });

  it('throws LLMError for an unknown provider', () => {
    expect(() =>
      // @ts-expect-error testing runtime guard for invalid provider value
      createLLMProvider(baseConfig({ provider: 'gemini' })),
    ).toThrow(LLMError);
  });

  it('returns a working provider whose completeStructured validates output', async () => {
    const provider = createLLMProvider(baseConfig({ provider: 'openai' }));
    const schema = z.object({ value: z.number() });
    const { data } = await provider.completeStructured({ prompt: 'x', schema });
    expect(data).toEqual({ value: 42 });
  });
});
