import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './index.js';
import { handleCustomCreate } from '../modules/customs/lobby.js';

export const customCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('custom')
    .setDescription('إدارة الكستمز والسكرمات')
    .addSubcommand((sc) =>
      sc
        .setName('create')
        .setDescription('إنشاء مباراة كستم جديدة')
        .addStringOption((o) =>
          o.setName('game').setDescription('اللعبة').setRequired(true).addChoices(
            { name: 'فالورانت', value: 'فالورانت' },
            { name: 'كود/وارزون', value: 'كود' },
            { name: 'فورتنايت', value: 'فورتنايت' },
            { name: 'أخرى', value: 'أخرى' },
          ),
        )
        .addIntegerOption((o) =>
          o.setName('team_size').setDescription('عدد لاعبي الفريق (1-10)').setRequired(true).setMinValue(1).setMaxValue(10),
        )
        .addStringOption((o) =>
          o.setName('balance').setDescription('طريقة التوزيع').setRequired(true).addChoices(
            { name: 'عشوائي', value: 'random' },
            { name: 'متوازن بالنقاط', value: 'balanced' },
          ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName('result')
        .setDescription('تسجيل نتيجة المباراة الجارية')
        .addStringOption((o) =>
          o.setName('winner').setDescription('الفريق الفائز').setRequired(true).addChoices(
            { name: 'فريق أ', value: 'a' },
            { name: 'فريق ب', value: 'b' },
          ),
        ),
    )
    .addSubcommand((sc) => sc.setName('cancel').setDescription('إلغاء المباراة النشطة')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return handleCustomCreate(interaction);
    const { handleCustomResult, handleCustomCancel } = await import('../modules/customs/result.js');
    if (sub === 'result') return handleCustomResult(interaction);
    if (sub === 'cancel') return handleCustomCancel(interaction);
  },
};
