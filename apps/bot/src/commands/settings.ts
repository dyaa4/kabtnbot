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
        .addBooleanOption((o) => o.setName('clear_channels').setDescription('السماح بكل الرومات (مسح القائمة)'))
        .addBooleanOption((o) => o.setName('personality').setDescription('الشخصية الكوميدية'))
        .addRoleOption((o) => o.setName('admin_role').setDescription('الرول الإداري للبوت')),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfig(interaction.guildId);
    if (!isGuildAdmin(interaction.member as GuildMember, config.admin_role_id)) {
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
              `الشخصية الكوميدية: ${config.voice.personality_enabled ? 'نعم' : 'لا'}`,
            ].join('\n'),
          },
          {
            name: '🛡️ الحماية والترحيب',
            value: [
              `الحماية: ${config.protection.enabled ? 'مفعّلة' : 'معطّلة'}`,
              `الترحيب: ${config.welcome.enabled ? 'مفعّل' : 'معطّل'}`,
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

    const patch: Record<string, unknown> = {};
    if (sub === 'voice') {
      const voice: Record<string, unknown> = {};
      const enabled = interaction.options.getBoolean('enabled');
      const wakeWord = interaction.options.getString('wake_word');
      const dialect = interaction.options.getString('dialect');
      const allowChannel = interaction.options.getChannel('allow_channel');
      const clearChannels = interaction.options.getBoolean('clear_channels');
      const personality = interaction.options.getBoolean('personality');
      const adminRole = interaction.options.getRole('admin_role');
      if (enabled !== null) voice.enabled = enabled;
      if (wakeWord !== null) voice.wake_word = wakeWord;
      if (dialect !== null) voice.dialect = dialect;
      if (clearChannels) voice.allowed_channel_ids = [];
      else if (allowChannel) {
        voice.allowed_channel_ids = [...new Set([...config.voice.allowed_channel_ids, allowChannel.id])];
      }
      if (personality !== null) voice.personality_enabled = personality;
      patch.voice = voice;
      if (adminRole !== null) patch.admin_role_id = adminRole.id;
    }
    await updateGuildConfig(interaction.guildId, patch);
    await interaction.reply({ content: S.settingsSaved, flags: MessageFlags.Ephemeral });
  },
};
