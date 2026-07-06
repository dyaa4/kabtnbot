import { LegalPage, type LegalContent } from './LegalPage.js';

const ar: LegalContent = {
  title: 'سياسة الخصوصية',
  updated: 'آخر تحديث: 6 يوليو 2026',
  sections: [
    {
      heading: '1. البيانات التي نجمعها',
      paragraphs: [
        'إعدادات السيرفر: معرف السيرفر وكل ما تضبطه في لوحة التحكم (كلمة التنبيه، قوائم الكلمات، قنوات الترحيب والسجل، الرول الإداري، وغيرها).',
        'عدادات النشاط: عدد الرسائل، عدد التفاعلات، ودقائق الصوت لكل عضو يومياً — أرقام فقط، ولا نخزّن نص أي رسالة في قاعدة بياناتنا.',
        'سجل الحضور الصوتي: وقت دخول وخروج الأعضاء من الرومات الصوتية ومعرف الروم — بيانات وصفية فقط، دون أي تسجيل للصوت.',
        'الصور المرفوعة: بانر الترحيب وصورة البوت التي يرفعها مدير السيرفر تُخزَّن في قاعدة بياناتنا.',
        'عند تسجيل الدخول للوحة التحكم: معرفك في Discord واسم المستخدم والصورة الرمزية عبر Discord OAuth، وملف تعريف ارتباط واحد للجلسة.',
      ],
    },
    {
      heading: '2. محتوى الرسائل',
      paragraphs: [
        'عند تفعيل «حماية النصوص» يقرأ البوت محتوى الرسائل لحظياً لفحصها فقط، ولا يخزّنه لدينا. عند حذف رسالة مخالفة قد يُنشر مقتطف منها في قناة السجل التي اختارها مدير سيرفرك — هذا يبقى داخل سيرفركم.',
        'إذا كانت حماية النصوص معطلة فالبوت لا يقرأ محتوى الرسائل إطلاقاً.',
      ],
    },
    {
      heading: '3. الصوت',
      paragraphs: [
        'أثناء وجود البوت في روم صوتي (بعد /join) يعالَج الصوت لحظياً للتعرف على كلمة التنبيه والأوامر، عبر مزود تحويل الصوت إلى نص. لا نخزّن التسجيلات الصوتية.',
      ],
    },
    {
      heading: '4. مزودو الخدمة الخارجيون',
      paragraphs: [
        'نستخدم: Discord (المنصة نفسها)، Groq (تحويل الصوت إلى نص وردود الذكاء الاصطناعي)، Google Gemini (مزود احتياطي اختياري للردود)، ElevenLabs (تحويل النص إلى صوت)، واستضافة قاعدة بيانات MongoDB. تعالج هذه الجهات البيانات اللازمة لتقديم وظيفتها فقط وفق سياساتها.',
      ],
    },
    {
      heading: '5. مدة الاحتفاظ',
      paragraphs: [
        'عدادات الاستخدام اليومية: 90 يوماً. عدادات النشاط: 120 يوماً. سجل الحضور الصوتي: 90 يوماً. لقطات عدد الأعضاء: 400 يوماً — تُحذف تلقائياً بعدها.',
        'الإعدادات والصور المرفوعة تبقى ما دام البوت مستخدماً، وتُحذف عند طلبك.',
      ],
    },
    {
      heading: '6. حقوقك',
      paragraphs: [
        'إزالة البوت من سيرفرك توقف أي جمع جديد للبيانات فوراً. يمكنك طلب حذف كل بيانات سيرفرك نهائياً عبر سيرفر الدعم.',
        'لا نبيع بياناتك ولا نستخدمها للإعلانات، ولا نستخدم أي أدوات تتبع أو تحليلات خارجية في لوحة التحكم.',
      ],
    },
    {
      heading: '7. التعديلات والتواصل',
      paragraphs: [
        'قد نحدّث هذه السياسة من وقت لآخر وسيُذكر تاريخ آخر تحديث أعلى الصفحة. لأي استفسار أو طلب حذف تواصل معنا عبر سيرفر الدعم على Discord.',
      ],
    },
  ],
};

const en: LegalContent = {
  title: 'Privacy Policy',
  updated: 'Last updated: July 6, 2026',
  sections: [
    {
      heading: '1. Data we collect',
      paragraphs: [
        'Server settings: the guild ID and everything you configure in the dashboard (wake word, word lists, welcome/log channels, admin role, and so on).',
        'Activity counters: per-member daily message counts, reaction counts and voice minutes — numbers only; we never store the text of any message in our database.',
        'Voice presence log: when members join and leave voice channels and the channel ID — metadata only, no audio is ever recorded.',
        'Uploaded images: the welcome banner and bot avatar uploaded by a server admin are stored in our database.',
        'When you sign in to the dashboard: your Discord ID, username and avatar via Discord OAuth, plus a single session cookie.',
      ],
    },
    {
      heading: '2. Message content',
      paragraphs: [
        'When text protection is enabled, the bot reads message content transiently to scan it — it is not stored by us. When a violating message is deleted, a snippet may be posted to the log channel your server admin chose; that stays inside your server.',
        'If text protection is disabled, the bot does not read message content at all.',
      ],
    },
    {
      heading: '3. Voice',
      paragraphs: [
        'While the bot is in a voice channel (after /join), audio is processed transiently to detect the wake word and commands via a speech-to-text provider. We do not store voice recordings.',
      ],
    },
    {
      heading: '4. Third-party providers',
      paragraphs: [
        'We use: Discord (the platform itself), Groq (speech-to-text and AI replies), Google Gemini (optional fallback AI provider), ElevenLabs (text-to-speech), and MongoDB database hosting. These providers process only the data needed for their function, under their own policies.',
      ],
    },
    {
      heading: '5. Retention',
      paragraphs: [
        'Daily usage counters: 90 days. Activity counters: 120 days. Voice presence log: 90 days. Member-count snapshots: 400 days — all deleted automatically afterwards.',
        'Settings and uploaded images are kept while the bot is in use and deleted on request.',
      ],
    },
    {
      heading: '6. Your rights',
      paragraphs: [
        'Removing the bot from your server immediately stops any new data collection. You can request permanent deletion of all your server’s data via the support server.',
        'We do not sell your data, do not use it for advertising, and use no third-party tracking or analytics in the dashboard.',
      ],
    },
    {
      heading: '7. Changes & contact',
      paragraphs: [
        'We may update this policy from time to time; the last-updated date is shown at the top of this page. For questions or deletion requests, contact us via the support server on Discord.',
      ],
    },
  ],
};

export function Privacy() {
  return <LegalPage content={{ ar, en }} />;
}
