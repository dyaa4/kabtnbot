import type { Guild } from 'discord.js';
import type { VoiceSession } from './sessions.js';

export async function startListening(_session: VoiceSession, _guild: Guild): Promise<void> {
  // Implemented in Task 14.
}
export function stopListening(_session: VoiceSession): void {}
