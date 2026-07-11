import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

function createGeminiProvider(): AIProvider {
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  return {
    name: 'gemini',
    async generateResponse(prompt, opts) {
      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: `System: ${opts.systemPrompt}` }] },
          { role: 'model', parts: [{ text: 'Understood.' }] },
          ...(opts.history ?? []).map((m) => ({
            role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
            parts: [{ text: m.content }],
          })),
        ],
      });
      const result = await chat.sendMessage(prompt);
      return result.response.text();
    },
  };
}

function withFallback(primary: AIProvider, secondary: AIProvider | null): AIProvider {
  return {
    name: primary.name,
    async generateResponse(prompt, opts) {
      try {
        return await primary.generateResponse(prompt, opts);
      } catch (err) {
        if (!secondary) throw err;
        console.warn(`[AI] ${primary.name} failed, falling back to ${secondary.name}`);
        return secondary.generateResponse(prompt, opts);
      }
    },
  };
}

let provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (provider) return provider;
  const groq = config.GROQ_API_KEY ? createGroqProvider() : null;
  const gemini = config.GEMINI_API_KEY ? createGeminiProvider() : null;
  if (groq) provider = withFallback(groq, gemini);
  else if (gemini) provider = gemini;
  else throw new Error('NO_AI_PROVIDER: set GROQ_API_KEY or GEMINI_API_KEY');
  return provider;
}
