import type { Language } from '@gamebot/shared';

// Arabic replies use one neutral style — the model, not a dialect setting,
// decides the phrasing.
const ARABIC_RULE = 'رد بالعربية بأسلوب طبيعي وواضح.';

// English name of each language, used to instruct the model which language to
// reply in for non-Arabic guilds.
const LANGUAGE_NAMES: Record<Language, string> = {
  ar: 'Arabic',
  en: 'English',
  de: 'German',
  tr: 'Turkish',
  fr: 'French',
  ru: 'Russian',
};

export function buildSystemPrompt(
  guildName: string,
  opts: { comedic?: boolean; language?: Language } = {},
): string {
  const language = opts.language ?? 'ar';

  if (language !== 'ar') {
    const lines = [
      `You are a smart voice assistant in a Discord gaming server called "${guildName}".`,
      `Reply ONLY in ${LANGUAGE_NAMES[language]}.`,
      'Your replies are read aloud: keep them very short (one to three sentences), with no symbols, emojis or lists.',
      'If you are asked something you do not know, say so honestly and briefly.',
    ];
    if (opts.comedic) {
      lines.push('Be very funny and playful with light jokes, while keeping the reply short.');
    }
    return lines.join('\n');
  }

  const lines = [
    `أنت بوت صوتي ذكي في سيرفر ديسكورد اسمه «${guildName}» مخصص للقيمنق.`,
    ARABIC_RULE,
    'ردودك تُقرأ بصوت مسموع: اجعلها قصيرة جداً (جملة إلى ثلاث جمل)، بلا رموز ولا إيموجي ولا قوائم.',
    'إذا سُئلت عن شيء لا تعرفه قل ذلك بصراحة وباختصار.',
  ];
  if (opts.comedic) {
    lines.push('كن كوميديًا جدًا ومرِحًا في ردك، بنكهة نكت خفيفة بلهجة السيرفر، مع بقاء الرد قصيرًا.');
  }
  return lines.join('\n');
}

/** System prompt for the /summarize command — text output, so short bullets are fine. */
export function buildSummaryPrompt(guildName: string, language: Language = 'ar'): string {
  if (language !== 'ar') {
    return [
      `You summarize a conversation in a Discord gaming server called "${guildName}".`,
      `Write the summary ONLY in ${LANGUAGE_NAMES[language]}.`,
      'Summarize concisely as short bullet points: the main topics, decisions and events.',
      'Ignore unimportant messages and repetition. Keep it to 3-6 lines at most.',
    ].join('\n');
  }
  return [
    `أنت مساعد في سيرفر ديسكورد اسمه «${guildName}» مخصص للقيمنق.`,
    ARABIC_RULE,
    'لخّص المحادثة التالية بإيجاز في نقاط قصيرة: أهم المواضيع والقرارات والأحداث.',
    'تجاهل الرسائل غير المهمة والتكرار. اكتب ملخصاً مفيداً في 3 إلى 6 أسطر كحد أقصى.',
  ].join('\n');
}
