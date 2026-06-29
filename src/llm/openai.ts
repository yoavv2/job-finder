import { generateText, generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  LLMError,
  type LLMProvider,
  type CompleteRequest,
  type StructuredRequest,
  type Usage,
} from './provider.js';

/**
 * OpenAI-backed {@link LLMProvider}. The Vercel AI SDK and `@ai-sdk/openai` are
 * imported ONLY here (and in the sibling provider/factory) — agents never see
 * them. Return shapes are normalized to the neutral interface so swapping to
 * Anthropic requires no caller change (Pitfall #12).
 */
export function createOpenAIProvider(opts: {
  apiKey: string;
  model: string;
}): LLMProvider {
  const model = createOpenAI({ apiKey: opts.apiKey })(opts.model);

  return {
    id: 'openai',

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
        throw new LLMError('OpenAI completion failed', err);
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
        throw new LLMError('OpenAI structured completion failed', err);
      }
      // Re-validate against the caller's schema: the schema is the contract,
      // and malformed output must throw rather than be silently used (#3/#7).
      const parsed = req.schema.safeParse(result.object);
      if (!parsed.success) {
        throw new LLMError(
          `OpenAI structured output failed schema validation: ${parsed.error.message}`,
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
