import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import type { Command } from './index.js';
import { S, t } from '../lib/strings.js';
import { tryConsumeAiQuestion } from '../lib/quotas.js';
import { getAIProvider } from '../modules/voice-ai/providers.js';
import { buildSummaryPrompt } from '../modules/voice-ai/prompts.js';

export const summarizeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('summarize')
    .setDescription('يلخّص آخر رسائل هذه القناة (Catch me up)')
    .addIntegerOption((o) =>
      o.setName('count').setDescription('عدد الرسائل (5-100)').setMinValue(5).setMaxValue(100),
    ),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    const config = await getGuildConfig(interaction.guildId);
    const strings = t(config.language);
    // Shares the daily AI-questions quota with /ask and /chat.
    if (!(await tryConsumeAiQuestion(interaction.guildId))) {
      await interaction.reply({ content: strings.aiQuotaExhausted, flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.channel;
    if (!channel?.isTextBased() || !('messages' in channel)) {
      await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    const limit = interaction.options.getInteger('count') ?? 50;
    const fetched = await channel.messages.fetch({ limit }).catch(() => null);
    // fetch() returns newest-first; reverse to chronological. Requires the
    // MessageContent intent (ENABLE_SUMMARY) or `content` will be empty.
    const lines = fetched
      ? [...fetched.values()]
          .filter((m) => !m.author.bot && m.content.trim().length > 0)
          .reverse()
          .map((m) => `${m.author.displayName}: ${m.content}`)
      : [];
    if (lines.length === 0) {
      await interaction.editReply(strings.summaryEmpty);
      return;
    }

    let text: string;
    try {
      text = await getAIProvider().generateResponse(lines.join('\n').slice(0, 8000), {
        systemPrompt: buildSummaryPrompt(config.voice.dialect, interaction.guild.name),
        username: interaction.user.displayName,
      });
    } catch {
      await interaction.editReply(strings.aiFailed);
      return;
    }
    await interaction.editReply(`${strings.summaryHeader}\n${text || strings.aiFailed}`);
  },
};
