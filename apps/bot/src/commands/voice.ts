import { SlashCommandBuilder, MessageFlags, type GuildMember } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import type { Command } from './index.js';
import { S, t, fmt } from '../lib/strings.js';
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await playSpeech(interaction.guildId!, interaction.options.getString('text', true));
      await interaction.editReply('🔊');
    } catch {
      await interaction.editReply(strings.ttsFailed);
    }
  },
};
