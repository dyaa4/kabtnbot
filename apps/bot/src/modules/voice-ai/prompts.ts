import type { Dialect } from '@gamebot/shared';

const DIALECT_RULES: Record<Dialect, string> = {
  gulf: 'رد باللهجة الخليجية العامية فقط. ممنوع الفصحى.',
  syrian: 'رد باللهجة السورية العامية فقط. ممنوع الفصحى.',
  egyptian: 'رد باللهجة المصرية العامية فقط. ممنوع الفصحى.',
  msa: 'رد بالعربية الفصحى المبسطة.',
};

export function buildSystemPrompt(dialect: Dialect, guildName: string, opts: { comedic?: boolean } = {}): string {
  const lines = [
    `أنت بوت صوتي ذكي في سيرفر ديسكورد اسمه «${guildName}» مخصص للقيمنق.`,
    DIALECT_RULES[dialect],
    'ردودك تُقرأ بصوت مسموع: اجعلها قصيرة جداً (جملة إلى ثلاث جمل)، بلا رموز ولا إيموجي ولا قوائم.',
    'إذا سُئلت عن شيء لا تعرفه قل ذلك بصراحة وباختصار.',
  ];
  if (opts.comedic) {
    lines.push('كن كوميديًا جدًا ومرِحًا في ردك، بنكهة نكت خفيفة بلهجة السيرفر، مع بقاء الرد قصيرًا.');
  }
  return lines.join('\n');
}
