import { type Client, type GuildMember, type Message, type PartialMessage, type TextChannel } from 'discord.js';
import { scanMessage } from '@gamebot/shared';
import { handleAntiSpam } from './anti-spam.js';
import { getCachedGuildConfig } from '../../lib/config-cache.js';
import { isGuildAdmin } from '../../lib/permissions.js';
import { t, fmt, type BotStrings } from '../../lib/strings.js';
import type { GuildConfig } from '@gamebot/shared';

// scanMessage reasons are internal enum tokens — map them to localized labels
// so LTR tokens never land inside RTL notice/log text (bidi jumble).
const REASON_KEY = {
  word: 'reasonWord',
  scam: 'reasonScam',
  invite: 'reasonInvite',
  shortener: 'reasonShortener',
  domain: 'reasonDomain',
} as const satisfies Record<string, keyof BotStrings>;

export function shouldModerate(config: GuildConfig, isAdmin: boolean): boolean {
  return config.protection.enabled && config.protection.text_protection && !isAdmin;
}

/**
 * Whether an edit needs rescanning. Embed-only updates (e.g. Discord adding a
 * link preview) fire messageUpdate without a content change — skip those. When
 * the old message is partial its content is unknown, so rescan to be safe.
 */
export function editNeedsRescan(oldContent: string | null, newContent: string): boolean {
  return oldContent === null || oldContent !== newContent;
}

/**
 * Deleted content as it appears in the moderation log: spoiler-wrapped so mods
 * opt in to reading it, pipes stripped (they would break the spoiler), and
 * truncated so a wall of text can't flood the log channel.
 */
export function logSnippet(content: string): string {
  const clean = content.replaceAll('|', '').trim();
  const short = clean.length > 180 ? `${clean.slice(0, 180)}…` : clean;
  return short.length > 0 ? `||${short}||` : '';
}

// Escalation: strikes per guild:user within a rolling window (in-memory, like
// the voice moderation warning state — resets on restart, which is acceptable).
const STRIKE_WINDOW_MS = 60 * 60 * 1000;
const strikes = new Map<string, { count: number; firstAt: number }>();

// Sweep expired strikes once the map grows large. Behaviour-neutral: an entry
// older than the window is treated as a fresh strike anyway, so dropping it
// changes nothing but keeps the map bounded on long-lived deployments.
const STRIKE_PRUNE_AT = 1000;
function pruneStrikes(nowMs: number): void {
  if (strikes.size < STRIKE_PRUNE_AT) return;
  for (const [k, s] of strikes) {
    if (nowMs - s.firstAt > STRIKE_WINDOW_MS) strikes.delete(k);
  }
}

export function registerStrike(key: string, nowMs: number = Date.now()): number {
  const current = strikes.get(key);
  if (!current || nowMs - current.firstAt > STRIKE_WINDOW_MS) {
    pruneStrikes(nowMs);
    strikes.set(key, { count: 1, firstAt: nowMs });
    return 1;
  }
  current.count += 1;
  return current.count;
}

/** Test-only view of how many strike entries are currently tracked. */
export function strikeMapSize(): number {
  return strikes.size;
}

export function clearStrikes(): void {
  strikes.clear();
}

/** 1st offense: delete only. 2nd within the hour: 5 min timeout. 3rd+: 1 hour. */
export function timeoutMsForStrike(count: number): number | null {
  if (count === 2) return 5 * 60 * 1000;
  if (count >= 3) return 60 * 60 * 1000;
  return null;
}

export async function moderateMessage(msg: Message): Promise<void> {
  if (!msg.guild || msg.author.bot || !msg.member) return;
  const config = await getCachedGuildConfig(msg.guild.id);
  const admin = isGuildAdmin(msg.member as GuildMember, config.admin_role_id);
  if (!shouldModerate(config, admin)) return;

  const verdict = scanMessage(msg.content, {
    customWords: config.protection.custom_words,
    blockedDomains: config.protection.blocked_domains,
  });
  if (!verdict.blocked) return;

  await msg.delete().catch(() => {});

  // Repeat offenders within the hour get escalating timeouts (opt-in setting;
  // requires the Moderate Members permission and role hierarchy).
  const strikeCount = registerStrike(`${msg.guild.id}:${msg.author.id}`);
  const timeoutMs = config.protection.text_timeout ? timeoutMsForStrike(strikeCount) : null;
  let timedOut = false;
  if (timeoutMs) {
    timedOut = await (msg.member as GuildMember)
      .timeout(timeoutMs, `text protection: ${verdict.reason}`)
      .then(() => true)
      .catch(() => false);
  }

  const strings = t(config.language);
  const reasonLabel = strings[REASON_KEY[verdict.reason!]];
  const notice = timedOut
    ? fmt(strings.textDeletedTimeout, {
        user: `<@${msg.author.id}>`,
        reason: reasonLabel,
        minutes: Math.round(timeoutMs! / 60000),
      })
    : fmt(strings.textDeleted, { user: `<@${msg.author.id}>`, reason: reasonLabel });
  const warn = await (msg.channel as TextChannel).send(notice).catch(() => null);
  if (warn) setTimeout(() => void warn.delete().catch(() => {}), 5000);

  if (config.protection.log_channel_id) {
    const log = msg.guild.channels.cache.get(config.protection.log_channel_id);
    if (log?.isTextBased()) {
      const snippet = logSnippet(msg.content);
      const lines = [
        fmt(strings.textLogDeleted, {
          user: `<@${msg.author.id}>`,
          channel: `<#${msg.channelId}>`,
          reason: reasonLabel,
        }) +
          (timedOut
            ? fmt(strings.textLogTimeoutSuffix, { minutes: Math.round(timeoutMs! / 60000), strike: strikeCount })
            : ''),
        ...(snippet ? [snippet] : []),
      ];
      await (log as TextChannel)
        // No pings: reposted content may contain @everyone/@user mentions.
        .send({ content: lines.join('\n'), allowedMentions: { parse: [] } })
        .catch(() => {});
    }
  }
}

export function registerTextProtection(client: Client): void {
  client.on('messageCreate', async (msg) => {
    try {
      // Cross-channel spam first: when it triggers, the message (and all its
      // copies) are already gone — the content scan has nothing left to do.
      if (await handleAntiSpam(msg)) return;
      await moderateMessage(msg);
    } catch (err) {
      console.error('[text-protection]', err);
    }
  });

  // Editing a clean message into a blocked one would otherwise bypass the
  // create-time scan entirely — rescan edits with the same rules.
  client.on('messageUpdate', async (oldMsg: Message | PartialMessage, newMsg: Message | PartialMessage) => {
    try {
      const full = newMsg.partial ? await newMsg.fetch() : newMsg;
      const oldContent = oldMsg.partial ? null : oldMsg.content;
      if (!editNeedsRescan(oldContent, full.content)) return;
      await moderateMessage(full);
    } catch (err) {
      console.error('[text-protection]', err);
    }
  });
}
