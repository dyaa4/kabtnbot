import type { Client, Message } from 'discord.js';
import { addXp } from '@gamebot/db';
import { getCachedGuildConfig } from '../lib/config-cache.js';
import { t, fmt } from '../lib/strings.js';

// Per-member cooldown so spamming doesn't farm XP. In-memory is fine: on restart
// everyone just gets one immediate award, no correctness issue.
const cooldowns = new Map<string, number>();

/** Grants XP per message (rate-limited), assigns reward roles and announces level-ups. */
export function registerLeveling(client: Client, now: () => number = Date.now): void {
  client.on('messageCreate', (msg) => {
    void awardXp(msg, now).catch((e) => console.error('[leveling]', (e as Error)?.message ?? e));
  });
}

async function awardXp(msg: Message, now: () => number): Promise<void> {
  if (!msg.inGuild() || msg.author.bot) return;
  const config = await getCachedGuildConfig(msg.guildId);
  if (!config.leveling.enabled) return;

  const key = `${msg.guildId}:${msg.author.id}`;
  const last = cooldowns.get(key) ?? 0;
  if (now() - last < config.leveling.cooldown_seconds * 1000) return;
  cooldowns.set(key, now());

  const res = await addXp(msg.guildId, msg.author.id, config.leveling.xp_per_message);
  if (!res.leveledUp) return;

  // Grant every reward role up to the new level (idempotent — skips ones already held).
  const member = msg.member;
  if (member) {
    for (const lr of config.leveling.level_roles) {
      if (lr.level <= res.level && !member.roles.cache.has(lr.role_id)) {
        await member.roles.add(lr.role_id).catch(() => {});
      }
    }
  }

  const strings = t(config.language);
  const text = fmt(strings.levelUp, { user: `<@${msg.author.id}>`, level: res.level });
  const target = config.leveling.announce_channel_id
    ? msg.guild.channels.cache.get(config.leveling.announce_channel_id) ?? null
    : msg.channel;
  if (target && target.isTextBased()) {
    await target.send({ content: text, allowedMentions: { users: [msg.author.id] } }).catch(() => {});
  }
}
