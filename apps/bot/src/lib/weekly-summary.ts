import type { Client, TextChannel } from 'discord.js';
import { getGuildConfigRead, getKv, setKv, topActive, activityDaily } from '@gamebot/db';

/**
 * Weekly activity recap, posted once every Friday evening (>= 18:00 UTC) into
 * the configured channel. The last posted date is stored in the KV store per
 * guild, so restarts and the hourly sweep never double-post.
 */

export function isSummaryDue(now: Date): boolean {
  return now.getUTCDay() === 5 && now.getUTCHours() >= 18;
}

export function summaryDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface TopEntry {
  user_id: string;
  messages: number;
  voice_seconds: number;
}

export function buildWeeklySummary(
  serverName: string,
  totals: { messages: number; voiceMinutes: number },
  top: TopEntry[],
): string {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = [
    `📊 **ملخص الأسبوع — ${serverName}**`,
    `💬 الرسائل: **${totals.messages}** • 🎙️ دقائق الصوت: **${totals.voiceMinutes}**`,
  ];
  if (top.length > 0) {
    lines.push('', 'الأكثر نشاطاً هذا الأسبوع:');
    top.forEach((entry, i) => {
      lines.push(
        `${medals[i] ?? '•'} <@${entry.user_id}> — ${entry.messages} رسالة، ${Math.round(entry.voice_seconds / 60)} دقيقة صوت`,
      );
    });
  }
  return lines.join('\n');
}

export async function runSummarySweep(client: Client, now: Date = new Date()): Promise<void> {
  if (!isSummaryDue(now)) return;
  const dateKey = summaryDateKey(now);

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await getGuildConfigRead(guild.id);
      if (!config.summary.enabled || !config.summary.channel_id) continue;

      const kvKey = `weekly_summary:${guild.id}`;
      if ((await getKv(kvKey)) === dateKey) continue; // already posted this Friday

      const channel = guild.channels.cache.get(config.summary.channel_id);
      if (!channel?.isTextBased()) continue;

      const [top, daily] = await Promise.all([topActive(guild.id, 7, 3), activityDaily(guild.id, 7)]);
      const totals = {
        messages: daily.reduce((sum, r) => sum + r.messages, 0),
        voiceMinutes: Math.round(daily.reduce((sum, r) => sum + r.voice_seconds, 0) / 60),
      };
      const content = buildWeeklySummary(guild.name, totals, top);
      await (channel as TextChannel).send({ content, allowedMentions: { parse: [] } }).catch(() => {});
      await setKv(kvKey, dateKey);
    } catch (err) {
      console.error('[summary]', guild.id, err);
    }
  }
}

export function registerWeeklySummary(client: Client): void {
  client.once('clientReady', () => {
    // Hourly sweep + one immediately, so a Friday-evening restart still posts.
    void runSummarySweep(client).catch((err) => console.error('[summary]', err));
    setInterval(
      () => void runSummarySweep(client).catch((err) => console.error('[summary]', err)),
      60 * 60 * 1000,
    );
  });
}
