import { SlashCommandBuilder, MessageFlags, type GuildMember } from 'discord.js';
import { getGuildConfigRead } from '@gamebot/db';
import type { Command } from './index.js';
import { S, t, fmt, type BotStrings } from '../lib/strings.js';
import { isGuildAdmin } from '../lib/permissions.js';
import { buildWelcomeMessage } from '../lib/welcome-message.js';
import { welcomeChannelIssue, type ChannelLike } from '../lib/welcome-diagnostics.js';

const ISSUE_KEY = {
  missing: 'welcomeChannelMissing',
  cannot_send: 'welcomeChannelNoSend',
  cannot_attach: 'welcomeChannelNoAttach',
} as const satisfies Record<string, keyof BotStrings>;

export const welcomeTestCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome-test')
    .setDescription('معاينة رسالة وصورة الترحيب كأنك عضو جديد (للإدارة)'),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.member) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfigRead(interaction.guildId);
    const strings = t(config.language);
    if (!isGuildAdmin(interaction.member as GuildMember, config.admin_role_id)) {
      await interaction.reply({ content: strings.notAdmin, flags: MessageFlags.Ephemeral });
      return;
    }

    // Rendering fetches the banner and avatar — defer so the token doesn't expire.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { content, files } = await buildWelcomeMessage(interaction.member as GuildMember, config);

    const lines = [
      config.welcome.enabled ? strings.welcomeEnabledNote : strings.welcomeDisabledNote,
      config.welcome.channel_id
        ? fmt(strings.welcomeChannelNote, { channel: `<#${config.welcome.channel_id}>` })
        : strings.welcomeNoChannelNote,
    ];
    if (config.welcome.channel_id && interaction.guild) {
      const channel = interaction.guild.channels.cache.get(config.welcome.channel_id);
      const issue = welcomeChannelIssue(channel as ChannelLike | undefined, interaction.guild.members.me);
      if (issue) lines.push(strings[ISSUE_KEY[issue]]);
    }
    const status = lines.join('\n');

    await interaction.editReply({ content: `${content}\n\n${status}`, files });
  },
};
