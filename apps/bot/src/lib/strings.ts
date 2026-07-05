export const S = {
  genericError: '❌ صار خطأ غير متوقع، حاول مرة ثانية.',
  notAdmin: '❌ هذا الأمر يحتاج صلاحية إدارة السيرفر أو الرول الإداري.',
  guildOnly: '❌ هذا الأمر يشتغل داخل سيرفر فقط.',
  // voice
  voiceDisabled: '⚠️ الميزات الصوتية معطلة في هذا السيرفر (/settings).',
  notInVoiceChannel: '❌ ادخل روم صوتي أول.',
  channelNotAllowed: '❌ هذا الروم مو مسموح للبوت (راجع /settings).',
  joinedVoice: '✅ دخلت الفويس وبدأت الاستماع 🎙️ (قل "{wake}" وبعدها أمرك)',
  leftVoice: '👋 طلعت من الفويس.',
  notConnected: '❌ البوت مو موجود في الفويس. استخدم /join',
  listenQuotaExhausted: '⏳ خلصت دقائق الاستماع اليومية لهذا السيرفر. نرجع بكرة!',
  aiQuotaExhausted: '⏳ خلصت أسئلة الذكاء الاصطناعي اليومية لهذا السيرفر.',
  ttsFailed: '❌ فشل تحويل النص إلى صوت.',
  aiFailed: '😅 ما قدرت أجاوب حالياً، جرب بعد شوي.',
  voiceHelp: 'الأوامر: اطلع، اسكت، السرعة، اطرد + اسم، قل + نص، أو اسألني أي شيء.',
  kickNeedsAdmin: '❌ طرد الأعضاء بالصوت يحتاج صلاحية إدارة السيرفر أو الرول الإداري.',
  kickNoMatch: '❓ ما قدرت أحدد مين تقصد، وضّح الاسم أكثر.',
  kickFailed: 'ما قدرت أطرد العضو، تأكد من صلاحياتي.',
  // settings
  settingsSaved: '✅ انحفظ الإعداد.',
  settingsTitle: '⚙️ إعدادات السيرفر',
} as const;

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
