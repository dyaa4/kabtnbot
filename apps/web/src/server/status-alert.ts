import { getBotStatus } from '@gamebot/db';

/**
 * Watches the bot heartbeat and posts to a Discord webhook when the bot goes
 * offline or recovers. Runs in the web server process — the bot cannot alert
 * about its own death. Enabled by setting ALERT_WEBHOOK_URL in .env.
 */

export type StatusTransition = 'went_offline' | 'came_online' | null;

/** No alert on the very first observation (prev === null) or without change. */
export function evaluateTransition(prev: boolean | null, current: boolean): StatusTransition {
  if (prev === null || prev === current) return null;
  return current ? 'came_online' : 'went_offline';
}

export function createStatusAlerter(webhookUrl: string, fetchFn: typeof fetch = fetch) {
  let prev: boolean | null = null;

  async function tick(): Promise<StatusTransition> {
    const status = await getBotStatus();
    const transition = evaluateTransition(prev, status.online);
    prev = status.online;
    if (!transition) return null;

    const content =
      transition === 'went_offline'
        ? `🔴 **كابتن بوت غير متصل!** آخر نبضة: ${status.last_seen ?? 'غير معروفة'}`
        : '🟢 **كابتن بوت عاد للاتصال.**';
    await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).catch((err) => console.error('[status-alert] webhook:', err));
    return transition;
  }

  return { tick };
}

export function startStatusAlerts(webhookUrl: string, intervalMs = 60_000): void {
  const alerter = createStatusAlerter(webhookUrl);
  setInterval(() => void alerter.tick().catch((err) => console.error('[status-alert]', err)), intervalMs);
  console.log('[Web] Bot status alerts enabled');
}
