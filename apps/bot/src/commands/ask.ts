import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig } from '@gamebot/db';
import type { Command } from './index.js';
import { S, t } from '../lib/strings.js';
import { tryConsumeAiQuestion } from '../lib/quotas.js';
import { getAIProvider } from '../modules/voice-ai/providers.js';
import { buildSystemPrompt } from '../modules/voice-ai/prompts.js';
import { getSession, playSpeech } from '../modules/voice-ai/sessions.js';

async function answer(interaction: Parameters<Command['execute']>[0], speakOut: boolean): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: S.guildOnly, flags: MessageFlags.Ephemeral });
    return;
  }
  const config = await getGuildConfig(interaction.guildId);
  const strings = t(config.language);
  if (!config.voice.enabled && speakOut) {
    await interaction.reply({ content: strings.voiceDisabled, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await tryConsumeAiQuestion(interaction.guildId))) {
    await interaction.reply({ content: strings.aiQuotaExhausted, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  let text: string;
  try {
    text = await getAIProvider().generateResponse(interaction.options.getString('prompt', true), {
      systemPrompt: buildSystemPrompt(config.voice.dialect, interaction.guild.name),
      username: interaction.user.displayName,
    });
  } catch {
    await interaction.editReply(strings.aiFailed);
    return;
  }
  await interaction.editReply(text || strings.aiFailed);
  if (speakOut && getSession(interaction.guildId)) {
    await playSpeech(interaction.guildId, text).catch(() => {});
  }
}

export const askCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('اسأل الذكاء الاصطناعي (يرد صوتياً إذا كان البوت في الفويس)')
    .addStringOption((o) => o.setName('prompt').setDescription('سؤالك').setRequired(true)),
  async execute(interaction) {
    await answer(interaction, true);
  },
};

export const chatCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('دردشة نصية مع الذكاء الاصطناعي')
    .addStringOption((o) => o.setName('prompt').setDescription('رسالتك').setRequired(true)),
  async execute(interaction) {
    await answer(interaction, false);
  },
};
