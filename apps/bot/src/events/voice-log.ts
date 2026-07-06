import type { Client } from 'discord.js';
import { startVoiceSession, endVoiceSession, closeAllOpenVoiceSessions } from '@gamebot/db';

/**
 * Voice presence log: who joined/left which voice channel and when — pure
 * gateway metadata via voiceStateUpdate, the bot never needs to be in a
 * channel and no audio is involved. Feeds the dashboard "voice log" tab.
 */
export function registerVoiceLog(client: Client): void {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      if (newState.member?.user.bot) return;
      const oldChannel = oldState.channelId;
      const newChannel = newState.channelId;
      if (oldChannel === newChannel) return; // mute/deafen/stream toggles

      if (newChannel) {
        // join or move — startVoiceSession closes any open session first
        await startVoiceSession(newState.guild.id, newState.id, newChannel);
      } else {
        await endVoiceSession(newState.guild.id, newState.id);
      }
    } catch (err) {
      console.error('[voice-log]', err);
    }
  });

  // After a restart the stored open sessions are stale: close them, then
  // re-open sessions for members currently connected.
  client.once('clientReady', () => {
    void (async () => {
      await closeAllOpenVoiceSessions();
      for (const guild of client.guilds.cache.values()) {
        for (const vs of guild.voiceStates.cache.values()) {
          if (vs.channelId && !vs.member?.user.bot) {
            await startVoiceSession(guild.id, vs.id, vs.channelId);
          }
        }
      }
    })().catch((err) => console.error('[voice-log] reconcile:', err));
  });
}
