import Groq from 'groq-sdk';
import { config } from '../../config.js';

export interface AIProvider {
  name: string;
  generateResponse(
    prompt: string,
    opts: {
      systemPrompt: string;
      username: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      /** Override sampling for deterministic classification calls. */
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<string>;
}

function createGroqProvider(): AIProvider {
  const groq = new Groq({ apiKey: config.GROQ_API_KEY });
  return {
    name: 'groq',
    async generateResponse(prompt, opts) {
      // Send the question as-is. An "<username> says:" wrapper leaks the
      // (generic) username into the model's answer and mixes English framing
      // into an Arabic turn — both degrade the reply.
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: opts.systemPrompt },
        ...(opts.history ?? []),
        { role: 'user', content: prompt },
      ];
      const completion = await groq.chat.completions.create({
        model: config.GROQ_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.6,
      });
      return completion.choices[0]?.message?.content || '';
    },
  };
}

let provider: AIProvider | null = null;

/**
 * The LLM behind every answer. Groq is the only provider (owner decision
 * 2026-07-26: Gemini removed). There is therefore NO fallback — a Groq outage
 * means no answers at all, and callers must keep tolerating a thrown/empty
 * response rather than assuming another provider will cover.
 */
export function getAIProvider(): AIProvider {
  if (provider) return provider;
  if (!config.GROQ_API_KEY) throw new Error('NO_AI_PROVIDER: set GROQ_API_KEY');
  provider = createGroqProvider();
  return provider;
}

/** Drop the memoized provider (config changed, tests). */
export function resetAIProvider(): void {
  provider = null;
}
