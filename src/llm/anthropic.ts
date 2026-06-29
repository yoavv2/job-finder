import { generateText, generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  LLMError,
  type LLMProvider,
  type CompleteRequest,
  type StructuredRequest,
  type Usage,
} from './provider.js';

/**
 * Anthropic-backed {@link LLMProvider}. Identical neutral return shapes to the
 * OpenAI provider — the contract test runs the same assertions against both to
 * catch any interface leak (Pitfall #12). Vendor SDKs are confined to this file.
 */
export function createAnthropicProvider(opts: {
  apiKey: string;
  model: string;
}): LLMProvider {
  const model = createAnthropic({ apiKey: opts.apiKey })(opts.model);

  return {
    id: 'anthropic',

    async complete(req: CompleteRequest) {
      try {
        const result = await generateText({
          model,
          system: req.system,
          prompt: req.prompt,
          temperature: req.temperature,
        });
        return { text: result.text, usage: normalizeUsage(result.usage) };
      } catch (err) {
        throw new LLMError('Anthropic completion failed', err);
      }
    },

    async completeStructured<T>(req: StructuredRequest<T>) {
      let result;
      try {
        result = await generateObject({
          model,
          schema: req.schema,
          system: req.system,
          prompt: req.prompt,
          temperature: req.temperature,
        });
      } catch (err) {
        throw new LLMError('Anthropic structured completion failed', err);
      }
      const parsed = req.schema.safeParse(result.object);
      if (!parsed.success) {
        throw new LLMError(
          `Anthropic structured output failed schema validation: ${parsed.error.message}`,
          parsed.error,
        );
      }
      return { data: parsed.data, usage: normalizeUsage(result.usage) };
    },
  };
}

/** Map the SDK's usage onto the neutral {@link Usage} shape. */
function normalizeUsage(usage?: {
  inputTokens?: number;
  outputTokens?: number;
}): Usage | undefined {
  if (!usage) return undefined;
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}
