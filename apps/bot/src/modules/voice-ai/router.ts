import type { Guild } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import { S } from '../../lib/strings.js';
import { tryConsumeAiQuestion } from '../../lib/quotas.js';
import { isGuildAdmin } from '../../lib/permissions.js';
import { getAIProvider } from './providers.js';
import { buildSystemPrompt } from './prompts.js';
import { resolveKickTarget } from './kick.js';
import { leaveGuildVoice, type VoiceSession } from './sessions.js';
import { stopListening } from './listen.js';

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

  const sayMatch = q.match(/^قل\s+(.+)$/i);
  if (sayMatch) return sayMatch[1];

  const kickMatch = q.match(/^(?:اطرد|كك|kick)\s*(.*)$/i);
  if (kickMatch) {
    const config = await getGuildConfig(guild.id);
    const speaker = guild.members.cache.get(speakerId);
    if (!speaker || !isGuildAdmin(speaker, config.admin_role_id)) return S.kickNeedsAdmin;

    const channel = guild.channels.cache.get(session.channelId);
    const members = channel?.isVoiceBased()
      ? [...channel.members.values()]
        .filter((m) => !m.user.bot)
        .map((m) => ({ id: m.id, displayName: m.displayName }))
      : [];
    const targetId = resolveKickTarget(kickMatch[1].trim(), members);
    if (!targetId) return S.kickNoMatch;

    const target = guild.members.cache.get(targetId);
    try {
      await target?.voice.disconnect();
    } catch {
      return S.kickFailed;
    }
    return `طردت ${target?.displayName ?? 'العضو'} من الفويس.`;
  }

  if (!q) return '';

  // Free-form question → AI (quota-gated)
  if (!(await tryConsumeAiQuestion(guild.id))) return S.aiQuotaExhausted;
  const config = await getGuildConfig(guild.id);
  try {
    const ai = getAIProvider();
    return await ai.generateResponse(q, {
      systemPrompt: buildSystemPrompt(config.voice.dialect, guild.name, { comedic: config.voice.personality_enabled }),
      username: 'أحد الأعضاء',
    });
  } catch {
    return S.aiFailed;
  }
}
