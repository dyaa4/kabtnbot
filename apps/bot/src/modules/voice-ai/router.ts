import type { Guild } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import { S } from '../../lib/strings.js';
import { tryConsumeAiQuestion } from '../../lib/quotas.js';
import { getAIProvider } from './providers.js';
import { buildSystemPrompt } from './prompts.js';
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
