import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChannelType, type GuildMember } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '@gamebot/db';
import { DIALECTS, LANGUAGES } from '@gamebot/shared';
import type { Command } from './index.js';
import { S, t, fmt, type BotStrings } from '../lib/strings.js';
import { isGuildAdmin } from '../lib/permissions.js';

const DIALECT_KEY: Record<string, keyof BotStrings> = {
  gulf: 'dialectGulf', syrian: 'dialectSyrian', egyptian: 'dialectEgyptian', msa: 'dialectMsa',
};

// Native names — identical in every dictionary, so they live here once.
export const LANGUAGE_LABELS: Record<(typeof LANGUAGES)[number], string> = {
  ar: 'العربية', en: 'English', de: 'Deutsch', tr: 'Türkçe', fr: 'Français', ru: 'Русский',
};

export const settingsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('إعدادات البوت لهذا السيرفر')
    .addSubcommand((sc) => sc.setName('view').setDescription('عرض الإعدادات الحالية'))
    .addSubcommand((sc) =>
      sc
        .setName('language')
        .setDescription('لغة رسائل البوت في هذا السيرفر / Bot message language')
        .addStringOption((o) =>
          o
            .setName('language')
            .setDescription('اللغة / Language')
            .setRequired(true)
            .addChoices(...LANGUAGES.map((l) => ({ name: LANGUAGE_LABELS[l], value: l }))),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('voice')
        .setDescription('إعدادات المساعد الصوتي')
        .addBooleanOption((o) => o.setName('enabled').setDescription('تفعيل/تعطيل الصوتي'))
        .addStringOption((o) => o.setName('wake_word').setDescription('كلمة التنبيه').setMinLength(2).setMaxLength(30))
        .addStringOption((o) =>
          o.setName('dialect').setDescription('اللهجة').addChoices(
            ...DIALECTS.map((d) => ({ name: { gulf: 'خليجية', syrian: 'سورية', egyptian: 'مصرية', msa: 'فصحى' }[d]!, value: d })),
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
    const strings = t(config.language);
    if (!isGuildAdmin(interaction.member as GuildMember, config.admin_role_id)) {
      await interaction.reply({ content: strings.notAdmin, flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setTitle(strings.settingsTitle)
        .addFields(
          {
            name: strings.settingsFieldVoice,
            value: [
              `${strings.labelEnabled}: ${config.voice.enabled ? strings.yes : strings.no}`,
              `${strings.labelWakeWord}: ${config.voice.wake_word}`,
              `${strings.labelDialect}: ${strings[DIALECT_KEY[config.voice.dialect]]}`,
              `${strings.labelPersonality}: ${config.voice.personality_enabled ? strings.yes : strings.no}`,
            ].join('\n'),
          },
          {
            name: strings.settingsFieldProtectionWelcome,
            value: [
              `${strings.labelProtection}: ${config.protection.enabled ? strings.on : strings.off}`,
              `${strings.labelWelcome}: ${config.welcome.enabled ? strings.on : strings.off}`,
              `${strings.labelLanguage}: ${LANGUAGE_LABELS[config.language]}`,
            ].join('\n'),
          },
          {
            name: strings.settingsFieldQuotas,
            value: fmt(strings.settingsQuotasLine, {
              listen: config.quotas.listen_minutes_per_day,
              ai: config.quotas.ai_questions_per_day,
            }),
          },
        )
        .setColor(0x64748b);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'language') {
      const language = interaction.options.getString('language', true);
      await updateGuildConfig(interaction.guildId, { language });
      // Confirm in the NEW language so the admin sees the switch took effect.
      await interaction.reply({
        content: t(language as (typeof LANGUAGES)[number]).settingsSaved,
        flags: MessageFlags.Ephemeral,
      });
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
    await interaction.reply({ content: strings.settingsSaved, flags: MessageFlags.Ephemeral });
  },
};
