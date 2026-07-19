import { AuditLogEvent, type Client, type Guild } from 'discord.js';
import {
  recordGuildPresence, recordGuildLeave, isGuildBlocked,
  recordGuildInviter, countActiveInvitedGuilds, getUserPlan,
  FREE_GUILD_LIMIT, PREMIUM_GUILD_LIMIT,
} from '@gamebot/db';

// Guild config doesn't exist yet at join time, so the farewell is bilingual
// instead of localized.
const INVITE_CAP_FAREWELL =
  'عذراً — الشخص الذي أضافني وصل الحد الأقصى لعدد السيرفرات في خطته، لذلك لا أستطيع البقاء هنا. ترقية الخطة من لوحة التحكم ترفع الحد. 👋\n' +
  "Sorry — the person who invited me has reached their plan's server limit, so I can't stay. Upgrading the plan on the dashboard lifts the limit. 👋";

/**
 * Best-effort inviter attribution: the newest BOT_ADD audit entry targeting
 * THIS bot. Missing permission, no entry, or any API error → null, and the
 * cap check is skipped entirely — a guild is never punished for our blindness.
 */
async function resolveInviter(guild: Guild): Promise<string | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 });
    for (const entry of logs.entries.values()) {
      if (entry.targetId === guild.client.user?.id && entry.executorId) return entry.executorId;
    }
  } catch {
    /* no VIEW_AUDIT_LOG or transient API failure */
  }
  return null;
}

/**
 * Keeps the owner-facing guild directory in sync and enforces the block flag:
 * a blocked guild is left immediately on (re)join. Syncs all current guilds on
 * startup so the admin panel reflects reality after a restart. On join it also
 * enforces the per-user invite cap (free 1 / premium 9) via audit-log
 * attribution.
 */
export function registerGuildDirectory(client: Client): void {
  client.once('clientReady', () => {
    for (const guild of client.guilds.cache.values()) {
      void recordGuildPresence(guild.id, guild.name, guild.memberCount).catch((e) =>
        console.error('[directory] sync:', (e as Error)?.message ?? e),
      );
    }
  });

  client.on('guildCreate', async (guild) => {
    try {
      if (await isGuildBlocked(guild.id)) {
        console.log(`[directory] leaving blocked guild ${guild.id}`);
        await guild.leave();
        return;
      }
      await recordGuildPresence(guild.id, guild.name, guild.memberCount);

      const inviter = await resolveInviter(guild);
      if (!inviter) return;
      await recordGuildInviter(guild.id, inviter);
      const [plan, otherGuilds] = await Promise.all([
        getUserPlan(inviter),
        // Exclude the joining guild: it was just recorded with this inviter.
        countActiveInvitedGuilds(inviter, guild.id),
      ]);
      const limit = plan.premium ? PREMIUM_GUILD_LIMIT : FREE_GUILD_LIMIT;
      if (otherGuilds >= limit) {
        console.log(`[directory] inviter ${inviter} over guild cap (${otherGuilds}/${limit}) — leaving ${guild.id}`);
        await guild.systemChannel?.send(INVITE_CAP_FAREWELL).catch(() => {});
        await guild.leave();
      }
    } catch (e) {
      console.error('[directory] guildCreate:', (e as Error)?.message ?? e);
    }
  });

  client.on('guildDelete', (guild) => {
    void recordGuildLeave(guild.id).catch((e) => console.error('[directory] guildDelete:', (e as Error)?.message ?? e));
  });
}
