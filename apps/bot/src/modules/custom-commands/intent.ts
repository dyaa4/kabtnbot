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

/**
 * The classifier's system prompt. Exported for tests. It is deliberately biased
 * HARD toward null: the utterance already passed the wake word, so the speaker
 * is addressing the bot — but addressing the bot with a QUESTION or chat is not
 * a command. Only an unmistakable order to perform a listed action may match;
 * everything the bot would ANSWER rather than DO returns null.
 */
export function buildIntentSystemPrompt(candidates: IntentCandidate[]): string {
  const list = candidates
    .map((c) => `${c.id}: ${c.name} — example phrases: ${c.triggers.join(' | ')}`)
    .join('\n');
  return [
    'You decide whether ONE spoken utterance is an explicit command to run one of the listed actions.',
    `Actions:\n${list}`,
    'Reply with ONLY minified JSON: {"command_id":"<id>"} ONLY when the utterance is a clear, direct ORDER to',
    'perform that exact action, phrased like its example phrases. Otherwise {"command_id":null}. No other text.',
    'The speaker is talking to the bot, but talking to the bot is NOT automatically a command. Return null for',
    'ALL of the following, even when addressed directly to the bot:',
    '- questions or requests for information or an opinion (e.g. "what do you think", "which is better", "how are you")',
    '- greetings, thanks, reactions, jokes, or small talk',
    '- statements, comments, or merely MENTIONING a related topic',
    '- casual conversation or background chatter between people',
    'The bot ANSWERS those with speech — it must NOT run an action for them. Match an action ONLY when the',
    'utterance is unmistakably an order to DO that specific thing. When in doubt, return null.',
  ].join('\n');
}

export async function classifyIntent(
  query: string,
  candidates: IntentCandidate[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  const raw = await getAIProvider().generateResponse(query, {
    systemPrompt: buildIntentSystemPrompt(candidates),
    username: 'classifier',
    temperature: 0,
    maxTokens: 64,
  });
  return parseIntentReply(raw, new Set(candidates.map((c) => c.id)));
}
