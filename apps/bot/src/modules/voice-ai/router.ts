import type { Guild } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import type { Language } from '@gamebot/shared';
import { t, fmt } from '../../lib/strings.js';
import { tryConsumeAiQuestion } from '../../lib/quotas.js';
import { isGuildAdmin } from '../../lib/permissions.js';
import { getAIProvider } from './providers.js';
import { buildSystemPrompt } from './prompts.js';
import { resolveKickTarget } from './kick.js';
import { leaveGuildVoice, type VoiceSession } from './sessions.js';
import { stopListening } from './listen.js';

interface CommandPatterns {
  leave: RegExp;
  stop: RegExp;
  help: RegExp;
  ping: RegExp;
  say: RegExp; // capture group 1 = text to speak
  kick: RegExp; // capture group 1 = target name (may be empty)
}

// Voice command triggers per bot language — STT transcribes in the guild's
// configured language, so we match that language's keywords.
const COMMANDS: Record<Language, CommandPatterns> = {
  ar: {
    leave: /^(اطلع|خروج|اخرج|طش|غادر|غادر القناة)$/i,
    stop: /^(اسكت|قف|توقف|اخرس)$/i,
    help: /^(ساعد|الاوامر|اوامر|وش تسوي|مساعدة)$/i,
    ping: /^(السرعة|سرعة|سرعه|بطء|بنق)$/i,
    say: /^قل\s+(.+)$/i,
    kick: /^(?:اطرد|كك)\s*(.*)$/i,
  },
  en: {
    leave: /^(leave|leave the channel|leave the voice|disconnect|get out)$/i,
    stop: /^(stop|stop listening|quiet|shut up|be quiet)$/i,
    help: /^(help|commands|what can you do)$/i,
    ping: /^(ping|latency|speed)$/i,
    say: /^say\s+(.+)$/i,
    kick: /^(?:kick|remove)\s*(.*)$/i,
  },
  de: {
    leave: /^(verlasse|verlassen|verlasse den kanal|geh raus|tschüss)$/i,
    stop: /^(stopp|stop|hör auf|sei still|ruhe)$/i,
    help: /^(hilfe|befehle|was kannst du)$/i,
    ping: /^(ping|latenz|geschwindigkeit)$/i,
    say: /^sag\s+(.+)$/i,
    kick: /^(?:kick|entferne|wirf raus)\s*(.*)$/i,
  },
  tr: {
    leave: /^(ayrıl|kanaldan ayrıl|çık|çık kanaldan)$/i,
    stop: /^(dur|durdur|dinlemeyi durdur|sus)$/i,
    help: /^(yardım|komutlar|ne yapabilirsin)$/i,
    ping: /^(ping|gecikme|hız)$/i,
    say: /^söyle\s+(.+)$/i,
    kick: /^(?:at|çıkar)\s*(.*)$/i,
  },
  fr: {
    leave: /^(quitte|quitter|quitte le salon|déconnecte|sors)$/i,
    stop: /^(stop|arrête|arrête d'écouter|silence|tais-toi)$/i,
    help: /^(aide|commandes|que sais-tu faire)$/i,
    ping: /^(ping|latence|vitesse)$/i,
    say: /^dis\s+(.+)$/i,
    kick: /^(?:expulse|vire|kick)\s*(.*)$/i,
  },
  ru: {
    leave: /^(выйди|выйти|покинь канал|уходи|отключись)$/i,
    stop: /^(стоп|останови|перестань слушать|замолчи|тихо)$/i,
    help: /^(помощь|команды|что ты умеешь)$/i,
    ping: /^(пинг|задержка|скорость)$/i,
    say: /^скажи\s+(.+)$/i,
    kick: /^(?:кикни|удали|выгони)\s*(.*)$/i,
  },
};

export async function routeVoiceCommand(
  guild: Guild, session: VoiceSession, query: string, speakerId: string,
): Promise<string> {
  const q = query.trim();
  const config = await getGuildConfig(guild.id);
  const strings = t(config.language);
  const cmds = COMMANDS[config.language] ?? COMMANDS.ar;

  if (cmds.leave.test(q)) {
    stopListening(session);
    leaveGuildVoice(guild.id);
    return strings.voiceLeft;
  }
  if (cmds.stop.test(q)) {
    stopListening(session);
    return strings.voiceStopped;
  }
  if (cmds.help.test(q)) return strings.voiceHelp;
  if (cmds.ping.test(q)) return fmt(strings.voicePing, { ms: guild.client.ws.ping });

  const sayMatch = q.match(cmds.say);
  if (sayMatch) return sayMatch[1];

  const kickMatch = q.match(cmds.kick);
  if (kickMatch) {
    const speaker = guild.members.cache.get(speakerId);
    if (!speaker || !isGuildAdmin(speaker, config.admin_role_id)) return strings.kickNeedsAdmin;

    const channel = guild.channels.cache.get(session.channelId);
    const members = channel?.isVoiceBased()
      ? [...channel.members.values()]
        .filter((m) => !m.user.bot)
        .map((m) => ({ id: m.id, displayName: m.displayName }))
      : [];
    const targetId = resolveKickTarget(kickMatch[1].trim(), members);
    if (!targetId) return strings.kickNoMatch;

    const target = guild.members.cache.get(targetId);
    try {
      await target?.voice.disconnect();
    } catch {
      return strings.kickFailed;
    }
    return fmt(strings.voiceKicked, { name: target?.displayName ?? '' });
  }

  if (!q) return '';

  // Free-form question → AI (quota-gated), answered in the guild's bot language.
  if (!(await tryConsumeAiQuestion(guild.id))) return strings.aiQuotaExhausted;
  try {
    const ai = getAIProvider();
    return await ai.generateResponse(q, {
      systemPrompt: buildSystemPrompt(config.voice.dialect, guild.name, {
        comedic: config.voice.personality_enabled,
        language: config.language,
      }),
      username: guild.members.cache.get(speakerId)?.displayName ?? 'a member',
    });
  } catch {
    return strings.aiFailed;
  }
}
