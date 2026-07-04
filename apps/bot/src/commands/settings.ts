import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChannelType, type GuildMember } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '@gamebot/db';
import { DIALECTS } from '@gamebot/shared';
import type { Command } from './index.js';
import { S } from '../lib/strings.js';
import { isGuildAdmin } from '../lib/permissions.js';

const DIALECT_LABELS: Record<string, string> = {
  gulf: 'خليجية', syrian: 'سورية', egyptian: 'مصرية', msa: 'فصحى',
};

export const settingsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('إعدادات البوت لهذا السيرفر')
    .addSubcommand((sc) => sc.setName('view').setDescription('عرض الإعدادات الحالية'))
    .addSubcommand((sc) =>
      sc
        .setName('voice')
        .setDescription('إعدادات المساعد الصوتي')
        .addBooleanOption((o) => o.setName('enabled').setDescription('تفعيل/تعطيل الصوتي'))
        .addStringOption((o) => o.setName('wake_word').setDescription('كلمة التنبيه').setMinLength(2).setMaxLength(30))
        .addStringOption((o) =>
          o.setName('dialect').setDescription('اللهجة').addChoices(
            ...DIALECTS.map((d) => ({ name: DIALECT_LABELS[d], value: d })),
          ),
        )
        .addChannelOption((o) =>
          o.setName('allow_channel').setDescription('إضافة روم صوتي لقائمة المسموح').addChannelTypes(ChannelType.GuildVoice),
        )
        .addBooleanOption((o) => o.setName('clear_channels').setDescription('السماح بكل الرومات (مسح القائمة)')),
    )
    .addSubcommand((sc) =>
      sc
        .setName('customs')
        .setDescription('إعدادات الكستمز')
        .addIntegerOption((o) => o.setName('win_points').setDescription('نقاط الفوز'))
        .addIntegerOption((o) => o.setName('loss_points').setDescription('نقاط الخسارة (سالبة عادة)'))
        .addRoleOption((o) => o.setName('admin_role').setDescription('الرول الإداري للبوت')),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfig(interaction.guildId);
    if (!isGuildAdmin(interaction.member as GuildMember, config.customs.admin_role_id)) {
      await interaction.reply({ content: S.notAdmin, flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setTitle(S.settingsTitle)
        .addFields(
          {
            name: '🎙️ الصوتي',
            value: [
              `مفعل: ${config.voice.enabled ? 'نعم' : 'لا'}`,
              `كلمة التنبيه: ${config.voice.wake_word}`,
              `اللهجة: ${DIALECT_LABELS[config.voice.dialect]}`,
            ].join('\n'),
          },
          {
            name: '🎮 الكستمز',
            value: [
              `نقاط الفوز: ${config.customs.win_points}`,
              `نقاط الخسارة: ${config.customs.loss_points}`,
              `الرول الإداري: ${config.customs.admin_role_id ? `<@&${config.customs.admin_role_id}>` : '—'}`,
            ].join('\n'),
          },
          {
            name: '⏳ الحصص اليومية',
            value: `استماع: ${config.quotas.listen_minutes_per_day} دقيقة • أسئلة AI: ${config.quotas.ai_questions_per_day}`,
          },
        )
        .setColor(0x64748b);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const patch: Record<string, Record<string, unknown>> = {};
    if (sub === 'voice') {
      const voice: Record<string, unknown> = {};
      const enabled = interaction.options.getBoolean('enabled');
      const wakeWord = interaction.options.getString('wake_word');
      const dialect = interaction.options.getString('dialect');
      const allowChannel = interaction.options.getChannel('allow_channel');
      const clearChannels = interaction.options.getBoolean('clear_channels');
      if (enabled !== null) voice.enabled = enabled;
      if (wakeWord !== null) voice.wake_word = wakeWord;
      if (dialect !== null) voice.dialect = dialect;
      if (clearChannels) voice.allowed_channel_ids = [];
      else if (allowChannel) {
        voice.allowed_channel_ids = [...new Set([...config.voice.allowed_channel_ids, allowChannel.id])];
      }
      patch.voice = voice;
    } else if (sub === 'customs') {
      const customs: Record<string, unknown> = {};
      const win = interaction.options.getInteger('win_points');
      const loss = interaction.options.getInteger('loss_points');
      const role = interaction.options.getRole('admin_role');
      if (win !== null) customs.win_points = win;
      if (loss !== null) customs.loss_points = loss;
      if (role !== null) customs.admin_role_id = role.id;
      patch.customs = customs;
    }
    await updateGuildConfig(interaction.guildId, patch);
    await interaction.reply({ content: S.settingsSaved, flags: MessageFlags.Ephemeral });
  },
};
