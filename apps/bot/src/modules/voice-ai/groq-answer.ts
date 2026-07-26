import type { Guild } from 'discord.js';
import type { GuildConfig } from '@gamebot/shared';
import { getAIProvider } from './providers.js';
import { buildSystemPrompt } from './prompts.js';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Cap on the history carried into a follow-up answer (3 user+assistant pairs).
 * Short on purpose: voice answers are brief and the model context is small. */
export const MAX_HISTORY_TURNS = 6;

/**
 * Generate a spoken-style answer via the text AI provider (Groq Llama).
 * The system prompt carries the guild language + Arabic dialect so
 * the WORDING matches the ElevenLabs dialect voice. `history` gives follow-ups
 * continuity; it is the caller's per-conversation buffer (cleared on handover).
 * Returns '' on provider failure — the caller stays silent rather than crash.
 */
export async function generateAnswer(
  guild: Guild,
  config: GuildConfig,
  query: string,
  speakerId: string,
  history: ChatTurn[] = [],
): Promise<string> {
  const systemPrompt = buildSystemPrompt(guild.name, {
    comedic: config.voice.personality_enabled,
    language: config.language,
    dialect: config.voice.dialect,
  });
  try {
    const ai = getAIProvider();
    const answer = await ai.generateResponse(query, {
      systemPrompt,
      username: guild.members.cache.get(speakerId)?.displayName ?? 'a member',
      history: history.slice(-MAX_HISTORY_TURNS),
    });
    return answer.trim();
  } catch (err) {
    console.error(`[GroqAnswer ${guild.id}]`, (err as Error)?.message ?? err);
    return '';
  }
}

/** Append a completed turn to a history buffer, trimming to the cap in place. */
export function pushHistory(history: ChatTurn[], userText: string, answer: string): void {
  history.push({ role: 'user', content: userText }, { role: 'assistant', content: answer });
  if (history.length > MAX_HISTORY_TURNS) history.splice(0, history.length - MAX_HISTORY_TURNS);
}
