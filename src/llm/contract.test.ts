import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { generateText, generateObject } from 'ai';
import { LLMError, type LLMProvider } from './provider.js';
import { createOpenAIProvider } from './openai.js';
import { createAnthropicProvider } from './anthropic.js';

// The contract test is the interface-leak detector: the SAME assertions run
// against BOTH providers with the AI SDK mocked, proving they satisfy one shape.
vi.mock('ai', () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => ({ provider: 'openai', model })),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (model: string) => ({ provider: 'anthropic', model })),
}));

const mockedGenerateText = vi.mocked(generateText);
const mockedGenerateObject = vi.mocked(generateObject);

const providers: Array<{ name: string; make: () => LLMProvider }> = [
  {
    name: 'openai',
    make: () => createOpenAIProvider({ apiKey: 'sk-test', model: 'gpt-x' }),
  },
  {
    name: 'anthropic',
    make: () =>
      createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-x' }),
  },
];

describe.each(providers)('LLMProvider contract: $name', ({ name, make }) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the LLMProvider shape (id, complete, completeStructured)', () => {
    const p = make();
    expect(typeof p.id).toBe('string');
    expect(p.id).toBe(name);
    expect(typeof p.complete).toBe('function');
    expect(typeof p.completeStructured).toBe('function');
  });

  it('complete returns neutral { text, usage } shape', async () => {
    mockedGenerateText.mockResolvedValue({
      text: 'hello',
      usage: { inputTokens: 10, outputTokens: 5 },
    } as never);
    const p = make();
    const res = await p.complete({ prompt: 'hi' });
    expect(res.text).toBe('hello');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('completeStructured returns schema-valid data', async () => {
    const schema = z.object({ score: z.number(), reason: z.string() });
    mockedGenerateObject.mockResolvedValue({
      object: { score: 88, reason: 'strong match' },
      usage: { inputTokens: 20, outputTokens: 8 },
    } as never);
    const p = make();
    const { data, usage } = await p.completeStructured({ prompt: 'score it', schema });
    expect(data).toEqual({ score: 88, reason: 'strong match' });
    expect(usage).toEqual({ inputTokens: 20, outputTokens: 8 });
  });

  it('throws LLMError when SDK output fails the Zod schema', async () => {
    const schema = z.object({ score: z.number() });
    // Malformed: score is a string, not a number.
    mockedGenerateObject.mockResolvedValue({
      object: { score: 'not-a-number' },
      usage: {},
    } as never);
    const p = make();
    await expect(
      p.completeStructured({ prompt: 'x', schema }),
    ).rejects.toBeInstanceOf(LLMError);
  });

  it('wraps SDK errors in LLMError', async () => {
    mockedGenerateText.mockRejectedValue(new Error('network boom'));
    const p = make();
    await expect(p.complete({ prompt: 'x' })).rejects.toBeInstanceOf(LLMError);
  });
});
