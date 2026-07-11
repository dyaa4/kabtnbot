import type { CommandFlow } from '@gamebot/shared';
import { getAIProvider } from '../voice-ai/providers.js';

// LLM intent-classification fallback: when no phrase matched, one cheap,
// strict-JSON call decides whether the utterance MEANS one of the custom
// commands ("verlass mal den Kanal bitte" → the leave flow). Voice only,
// quota-gated by the caller.

export interface IntentCandidate {
  id: string;
  name: string;
  triggers: string[];
}

export function candidatesOf(flows: CommandFlow[]): IntentCandidate[] {
  return flows
    .filter((f) => f.enabled && f.sources.voice && f.llm_fallback)
    .map((f) => ({ id: f.id, name: f.name, triggers: f.triggers }));
}

/** Defensive parse of the model reply — fences stripped, id verified. Exported for tests. */
export function parseIntentReply(raw: string, candidateIds: ReadonlySet<string>): string | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { command_id?: unknown };
    return typeof parsed.command_id === 'string' && candidateIds.has(parsed.command_id)
      ? parsed.command_id
      : null;
  } catch {
    return null;
  }
}

export async function classifyIntent(
  query: string,
  candidates: IntentCandidate[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  const list = candidates
    .map((c) => `${c.id}: ${c.name} — example phrases: ${c.triggers.join(' | ')}`)
    .join('\n');
  const systemPrompt =
    'You map a user utterance to one of the listed commands, or none.\n' +
    `Commands:\n${list}\n` +
    'Reply with ONLY minified JSON: {"command_id":"<id>"} if the utterance clearly asks for one of the commands, ' +
    'or {"command_id":null} otherwise. No other text.';
  const raw = await getAIProvider().generateResponse(query, {
    systemPrompt,
    username: 'classifier',
    temperature: 0,
    maxTokens: 64,
  });
  return parseIntentReply(raw, new Set(candidates.map((c) => c.id)));
}
