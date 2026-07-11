import type { Guild } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import {
  matchCustomFlows, matchBuiltinExtraTriggers, isSpeakerAllowed,
  type BuiltinCommandKey, type BuiltinOverrides, type CommandFlow, type GuildCommandFlows, type Language,
} from '@gamebot/shared';
import { t, fmt } from '../../lib/strings.js';
import { tryConsumeAiQuestion } from '../../lib/quotas.js';
import { isGuildAdmin } from '../../lib/permissions.js';
import { getCachedCommandFlows } from '../../lib/flows-cache.js';
import { executeActions, type ExecContext } from '../custom-commands/executor.js';
import { classifyIntent, candidatesOf } from '../custom-commands/intent.js';
import { checkCooldown } from '../custom-commands/cooldown.js';
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

// Original built-in precedence — kept exactly (say/kick last because their
// prefix patterns are the loosest).
const BUILTIN_ORDER: BuiltinCommandKey[] = ['leave', 'stop', 'help', 'ping', 'say', 'kick'];

/** First built-in whose stock regex or admin-added extra trigger matches; disabled overrides never hit. */
function matchBuiltin(
  cmds: CommandPatterns,
  overrides: BuiltinOverrides,
  q: string,
): { key: BuiltinCommandKey; args: string } | null {
  for (const key of BUILTIN_ORDER) {
    if (overrides[key]?.enabled === false) continue;
    if (key === 'say' || key === 'kick') {
      const m = q.match(cmds[key]);
      if (m) return { key, args: (m[1] ?? '').trim() };
    } else if (cmds[key].test(q)) {
      return { key, args: '' };
    }
  }
  return matchBuiltinExtraTriggers(overrides, q);
}

export async function routeVoiceCommand(
  guild: Guild, session: VoiceSession, query: string, speakerId: string,
): Promise<string> {
  const q = query.trim();
  const config = await getGuildConfig(guild.id);
  const strings = t(config.language);
  const cmds = COMMANDS[config.language] ?? COMMANDS.ar;
  // Command flows are a premium feature: without premium, custom flows,
  // built-in overrides and the LLM intent fallback are all inert — the
  // built-ins behave exactly like stock.
  const flows: GuildCommandFlows = config.premium.active
    ? await getCachedCommandFlows(guild.id)
    : { flows: [], builtin_overrides: {}, folders: [] };
  const speaker = guild.members.cache.get(speakerId);
  const speakerRoleIds = speaker ? [...speaker.roles.cache.keys()] : [];

  const runFlow = async (flow: CommandFlow, args: string): Promise<string> => {
    if (!isSpeakerAllowed(flow.conditions, speakerId, speakerRoleIds)) {
      return strings.commandNotAllowed;
    }
    if (flow.conditions.channel_ids.length > 0 && !flow.conditions.channel_ids.includes(session.channelId)) {
      return '';
    }
    if (!checkCooldown(`${guild.id}:${flow.id}:${speakerId}`, flow.cooldown_seconds)) return '';
    const ctx: ExecContext = {
      guild, invokerId: speakerId, utterance: q, args, source: 'voice', session, config,
    };
    return (await executeActions(flow.actions, ctx)).reply;
  };

  // 1. Custom flows by phrase — deliberately BEFORE built-ins so an admin can
  // shadow a stock phrase with their own command.
  const custom = matchCustomFlows(flows.flows, q, 'voice');
  if (custom) return runFlow(custom.flow, custom.args);

  // 2. Built-ins, gated by dashboard overrides. With no overrides saved this
  // behaves byte-identically to the old if-chain.
  const builtin = matchBuiltin(cmds, flows.builtin_overrides, q);
  if (builtin) {
    const { key, args } = builtin;
    const ov = flows.builtin_overrides[key];
    const hasCustomGate = ov !== undefined && (ov.role_ids.length > 0 || ov.user_ids.length > 0);
    const allowed = hasCustomGate
      ? isSpeakerAllowed(ov, speakerId, speakerRoleIds)
      : key !== 'kick' || (!!speaker && isGuildAdmin(speaker, config.admin_role_id));
    if (!allowed) return key === 'kick' && !hasCustomGate ? strings.kickNeedsAdmin : strings.commandNotAllowed;

    switch (key) {
      case 'leave':
        // leaveGuildVoice tears down subscriptions + handler itself; calling
        // stopListening first would deafen-rejoin right before the destroy.
        leaveGuildVoice(guild.id);
        return strings.voiceLeft;
      case 'stop':
        stopListening(session);
        return strings.voiceStopped;
      case 'help':
        return strings.voiceHelp;
      case 'ping':
        return fmt(strings.voicePing, { ms: guild.client.ws.ping });
      case 'say':
        return args;
      case 'kick': {
        const channel = guild.channels.cache.get(session.channelId);
        const members = channel?.isVoiceBased()
          ? [...channel.members.values()]
            .filter((m) => !m.user.bot)
            .map((m) => ({ id: m.id, displayName: m.displayName }))
          : [];
        const targetId = resolveKickTarget(args, members);
        if (!targetId) return strings.kickNoMatch;

        const target = guild.members.cache.get(targetId);
        try {
          await target?.voice.disconnect();
        } catch {
          return strings.kickFailed;
        }
        return fmt(strings.voiceKicked, { name: target?.displayName ?? '' });
      }
    }
  }

  if (!q) return '';

  // 3+4 share ONE quota consume: the intent classification and the free-form
  // answer are alternatives, not two questions.
  if (!(await tryConsumeAiQuestion(guild.id))) return strings.aiQuotaExhausted;

  // 3. LLM intent fallback — did the speaker MEAN one of the custom commands?
  const candidates = candidatesOf(flows.flows);
  if (candidates.length > 0) {
    const matchedId = await classifyIntent(q, candidates).catch(() => null);
    if (matchedId) {
      const flow = flows.flows.find((f) => f.id === matchedId);
      if (flow) return runFlow(flow, q);
    }
  }

  // 4. Free-form question → AI, answered in the guild's bot language.
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
