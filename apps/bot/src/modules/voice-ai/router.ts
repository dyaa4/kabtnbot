import type { Guild } from 'discord.js';
import { getActiveMatch, getGuildConfig } from '@gamebot/db';
import { splitTeams } from '@gamebot/shared';
import { S } from '../../lib/strings.js';
import { tryConsumeAiQuestion } from '../../lib/quotas.js';
import { isGuildAdmin } from '../../lib/permissions.js';
import { getAIProvider } from './providers.js';
import { buildSystemPrompt } from './prompts.js';
import { leaveGuildVoice, type VoiceSession } from './sessions.js';
import { stopListening } from './listen.js';

/** Quick shuffle of the bot's current voice channel members — no match, no points. */
async function quickShuffle(guild: Guild, session: VoiceSession): Promise<string> {
  const channel = guild.channels.cache.get(session.channelId);
  if (!channel || !('isVoiceBased' in channel) || !channel.isVoiceBased()) return S.notInVoiceChannel;
  const members = [...channel.members.values()].filter((m) => !m.user.bot);
  if (members.length < 2) return S.needTwoPlayers;
  const { teamA, teamB } = splitTeams(members.map((m) => ({ userId: m.id, points: 0 })), 'random');
  const name = (id: string) => channel.members.get(id)?.displayName ?? id;
  return `فريق أ: ${teamA.map(name).join('، ')}. فريق ب: ${teamB.map(name).join('، ')}.`;
}

export async function routeVoiceCommand(
  guild: Guild, session: VoiceSession, query: string, speakerId: string,
): Promise<string> {
  const q = query.trim();

  if (/^(اطلع|خروج|اخرج|طش|leave)$/i.test(q)) {
    stopListening(session);
    leaveGuildVoice(guild.id);
    return 'طلعت من الفويس.';
  }
  if (/^(اسكت|قف|توقف|اخرس|stop)$/i.test(q)) {
    stopListening(session);
    return 'وقفت الاستماع.';
  }
  if (/^(ساعد|الاوامر|اوامر|help|وش تسوي)$/i.test(q)) return S.voiceHelp;
  if (/^(السرعة|سرعة|سرعه|ping|بطء)$/i.test(q)) return `سرعة الاتصال ${guild.client.ws.ping} ملي ثانية.`;

  if (/^(وزع|قسم|فرق|shuffle)/i.test(q)) {
    const lobby = await getActiveMatch(guild.id);
    if (lobby && lobby.status === 'lobby' && lobby.players.length >= 2) {
      const config = await getGuildConfig(guild.id);
      const member = guild.members.cache.get(speakerId);
      const allowed =
        speakerId === lobby.creator_id ||
        (member !== undefined && isGuildAdmin(member, config.customs.admin_role_id));
      if (!allowed) return S.onlyCreatorOrAdmin;
      const { startMatchCore } = await import('../customs/start.js');
      const { disableLobbyMessage } = await import('../customs/result.js');
      const { started } = await startMatchCore(guild, lobby);
      await disableLobbyMessage(guild, started);
      return `بدأت المباراة! فريق أ ${started.team_a.length} لاعبين وفريق ب ${started.team_b.length}. انتقلوا لروماتكم.`;
    }
    return quickShuffle(guild, session);
  }

  const sayMatch = q.match(/^قل\s+(.+)$/i);
  if (sayMatch) return sayMatch[1];

  if (!q) return '';

  // Free-form question → AI (quota-gated)
  if (!(await tryConsumeAiQuestion(guild.id))) return S.aiQuotaExhausted;
  const config = await getGuildConfig(guild.id);
  try {
    const ai = getAIProvider();
    return await ai.generateResponse(q, {
      systemPrompt: buildSystemPrompt(config.voice.dialect, guild.name),
      username: 'أحد الأعضاء',
    });
  } catch {
    return S.aiFailed;
  }
}
