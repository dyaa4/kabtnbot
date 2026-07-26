import { SlashCommandBuilder, MessageFlags, type GuildMember } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import type { Command } from './index.js';
import { S, t, fmt } from '../lib/strings.js';
import { isGuildPremiumCached } from '../lib/premium-cache.js';
import { tryConsumeAiQuestion } from '../lib/quotas.js';
import { joinGuildVoice, leaveGuildVoice, playSpeech, getSession } from '../modules/voice-ai/sessions.js';

async function requireVoiceContext(interaction: Parameters<Command['execute']>[0]) {
  if (!interaction.guildId) {
    await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
    return null;
  }
  const config = await getGuildConfig(interaction.guildId);
  if (!config.voice.enabled) {
    await interaction.reply({ content: t(config.language).voiceDisabled, flags: MessageFlags.Ephemeral });
    return null;
  }
  // The voice assistant is STRICTLY premium (owner decision 2026-07-19):
  // only guilds linked by a PREMIUM account may use join/listen/speak — a
  // free account's link unlocks web features but not voice. /leave stays
  // ungated so the bot can always be sent away.
  if (!(await isGuildPremiumCached(interaction.guildId))) {
    await interaction.reply({ content: t(config.language).voicePremiumRequired, flags: MessageFlags.Ephemeral });
    return null;
  }
  return config;
}

export const joinCommand: Command = {
  data: new SlashCommandBuilder().setName('join').setDescription('يدخل البوت الفويس ويبدأ الاستماع'),
  async execute(interaction) {
    const config = await requireVoiceContext(interaction);
    if (!config) return;
    const strings = t(config.language);
    const channel = (interaction.member as GuildMember).voice.channel;
    if (!channel) {
      await interaction.reply({ content: strings.notInVoiceChannel, flags: MessageFlags.Ephemeral });
      return;
    }
    if (config.voice.allowed_channel_ids.length > 0 && !config.voice.allowed_channel_ids.includes(channel.id)) {
      await interaction.reply({ content: strings.channelNotAllowed, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    const session = await joinGuildVoice(channel);
    const { startListening } = await import('../modules/voice-ai/listen.js');
    const listening = await startListening(session, interaction.guild!);
    await interaction.editReply(
      listening ? fmt(strings.joinedVoice, { wake: config.voice.wake_word }) : strings.listenQuotaExhausted,
    );
  },
};

// Resuming by VOICE is impossible on purpose: "stop listening" self-deafens
// the bot (crossed-out headset), so it cannot hear a spoken resume command.
export const listenCommand: Command = {
  data: new SlashCommandBuilder().setName('listen').setDescription('يرجع البوت يستمع بعد إيقاف الاستماع'),
  async execute(interaction) {
    const config = await requireVoiceContext(interaction);
    if (!config) return;
    const strings = t(config.language);
    const session = getSession(interaction.guildId!);
    if (!session) {
      await interaction.reply({ content: strings.notConnected, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    const { startListening } = await import('../modules/voice-ai/listen.js');
    const listening = await startListening(session, interaction.guild!);
    await interaction.editReply(
      listening ? fmt(strings.voiceResumed, { wake: config.voice.wake_word }) : strings.listenQuotaExhausted,
    );
  },
};

export const leaveCommand: Command = {
  data: new SlashCommandBuilder().setName('leave').setDescription('يطلع البوت من الفويس'),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    leaveGuildVoice(interaction.guildId);
    await interaction.reply(S.leftVoice);
  },
};

export const speakCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('speak')
    .setDescription('البوت يقرأ نصك في الفويس')
    .addStringOption((o) => o.setName('text').setDescription('النص').setRequired(true).setMaxLength(300)),
  async execute(interaction) {
    const config = await requireVoiceContext(interaction);
    if (!config) return;
    const strings = t(config.language);
    if (!getSession(interaction.guildId!)) {
      await interaction.reply({ content: strings.notConnected, flags: MessageFlags.Ephemeral });
      return;
    }
    // Synthesis is billed per character and /speak takes ARBITRARY text from
    // ANY member of a premium guild — uncharged, it was an unbounded hole in
    // the monthly cost ceiling (300 chars a call, repeatable at will). It
    // draws on the same pool as an AI question because it costs the same to
    // say. Unlike the AI path there is nothing to refund: the charge happens
    // before synthesis, and a failed synthesis is the rare case.
    if (!(await tryConsumeAiQuestion(interaction.guildId!))) {
      await interaction.reply({ content: strings.aiQuotaExhausted, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await playSpeech(interaction.guildId!, interaction.options.getString('text', true));
      await interaction.editReply('🔊');
    } catch {
      await interaction.editReply(strings.ttsFailed);
    }
  },
};
