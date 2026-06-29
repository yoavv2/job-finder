import { getEnv, type Config } from '../config/load.js';
import { LLMError, type LLMProvider } from './provider.js';
import { createOpenAIProvider } from './openai.js';
import { createAnthropicProvider } from './anthropic.js';

/**
 * The single entry point agents use to obtain an {@link LLMProvider}.
 *
 * Provider selection is driven PURELY by `config.llm.provider` — switching from
 * OpenAI to Anthropic (or back) requires changing only that one config value,
 * no code. API keys are read from the environment via `getEnv()` HERE and only
 * here (Pitfalls #4/#10) — never hardcoded, never sourced from config.yaml.
 */
export function createLLMProvider(config: Config): LLMProvider {
  const { provider, model } = config.llm;

  switch (provider) {
    case 'openai':
      return createOpenAIProvider({
        apiKey: requireKey('OPENAI_API_KEY'),
        model,
      });
    case 'anthropic':
      return createAnthropicProvider({
        apiKey: requireKey('ANTHROPIC_API_KEY'),
        model,
      });
    default:
      throw new LLMError(
        `Unknown LLM provider "${provider as string}" in config.llm.provider (expected "openai" or "anthropic")`,
      );
  }
}

/** Read a required API key from env, normalizing the missing-key error. */
function requireKey(name: string): string {
  try {
    return getEnv(name);
  } catch (err) {
    throw new LLMError(
      `Missing API key for LLM provider: ${name} is not set`,
      err,
    );
  }
}
