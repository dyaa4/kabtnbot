import { LegalPage, type LegalContent } from './LegalPage.js';

const ar: LegalContent = {
  title: 'شروط الاستخدام',
  updated: 'آخر تحديث: 6 يوليو 2026',
  sections: [
    {
      heading: '1. قبول الشروط',
      paragraphs: [
        'باستخدامك بوت «كابتن» أو لوحة التحكم الخاصة به فأنت توافق على هذه الشروط. إذا كنت لا توافق عليها فلا تستخدم الخدمة.',
        'يجب أن تلتزم أيضاً بشروط خدمة Discord وإرشادات مجتمعها، وأن يكون عمرك 13 عاماً على الأقل (أو الحد الأدنى لعمر استخدام Discord في بلدك).',
      ],
    },
    {
      heading: '2. وصف الخدمة',
      paragraphs: [
        'كابتن بوت Discord يوفر مساعداً صوتياً بالذكاء الاصطناعي، وحماية تلقائية للصوت والنص، ورسائل ترحيب بصور مخصصة، وإحصائيات نشاط، مع لوحة تحكم ويب لإدارة الإعدادات.',
        'تُقدَّم الخدمة كما هي، وقد تتغير المزايا أو الحصص اليومية أو تتوقف الخدمة مؤقتاً للصيانة دون إشعار مسبق.',
      ],
    },
    {
      heading: '3. الاستخدام المقبول',
      paragraphs: [
        'يُمنع استخدام البوت لأي نشاط مخالف للقانون أو لشروط Discord، ويُمنع محاولة تجاوز أنظمة الحماية أو الحصص اليومية أو إساءة استخدام واجهات الخدمة.',
        'مدير السيرفر مسؤول عن إعدادات البوت في سيرفره، بما في ذلك قوائم الكلمات المحظورة وقناة السجل ومن يحمل الرول الإداري.',
      ],
    },
    {
      heading: '4. المزايا المدفوعة',
      paragraphs: [
        'قد نوفر مستقبلاً خطة «بريميوم» بمزايا إضافية. تفاصيل الأسعار والفوترة ستُعرض بوضوح قبل أي عملية شراء، وتخضع لشروط إضافية عند إطلاقها.',
      ],
    },
    {
      heading: '5. حدود المسؤولية',
      paragraphs: [
        'الخدمة مقدمة دون أي ضمانات صريحة أو ضمنية. لسنا مسؤولين عن محتوى ينشره أعضاء سيرفرك، ولا عن أي أضرار ناتجة عن انقطاع الخدمة أو أخطائها، وذلك ضمن الحد الذي يسمح به القانون.',
        'أنظمة الحماية أدوات مساعدة ولا تضمن اكتشاف كل المحتوى المخالف.',
      ],
    },
    {
      heading: '6. إنهاء الخدمة',
      paragraphs: [
        'يمكنك إزالة البوت من سيرفرك في أي وقت. يحق لنا إيقاف الخدمة عن أي سيرفر يخالف هذه الشروط أو يسيء استخدام الخدمة.',
      ],
    },
    {
      heading: '7. التعديلات على الشروط',
      paragraphs: [
        'قد نحدّث هذه الشروط من وقت لآخر، ويُعد استمرارك في استخدام الخدمة بعد التحديث موافقة على النسخة الجديدة. تاريخ آخر تحديث مذكور أعلى الصفحة.',
      ],
    },
    {
      heading: '8. التواصل',
      paragraphs: ['لأي استفسار حول هذه الشروط تواصل معنا عبر سيرفر الدعم على Discord.'],
    },
  ],
};

const en: LegalContent = {
  title: 'Terms of Service',
  updated: 'Last updated: July 6, 2026',
  sections: [
    {
      heading: '1. Acceptance',
      paragraphs: [
        'By using the Kabtn bot or its web dashboard you agree to these terms. If you do not agree, do not use the service.',
        'You must also comply with the Discord Terms of Service and Community Guidelines, and be at least 13 years old (or the minimum age required to use Discord in your country).',
      ],
    },
    {
      heading: '2. The service',
      paragraphs: [
        'Kabtn is a Discord bot providing an AI voice assistant, automatic voice and text protection, welcome messages with generated images, activity statistics, and a web dashboard for configuration.',
        'The service is provided as-is; features and daily quotas may change, and the service may be temporarily unavailable for maintenance without prior notice.',
      ],
    },
    {
      heading: '3. Acceptable use',
      paragraphs: [
        'You may not use the bot for anything unlawful or against Discord’s terms, attempt to bypass protection systems or daily quotas, or abuse the service’s interfaces.',
        'Server administrators are responsible for the bot’s configuration in their server, including blocked-word lists, the log channel, and who holds the admin role.',
      ],
    },
    {
      heading: '4. Paid features',
      paragraphs: [
        'A Premium plan with additional features may be offered in the future. Pricing and billing details will be shown clearly before any purchase and will be subject to additional terms at launch.',
      ],
    },
    {
      heading: '5. Limitation of liability',
      paragraphs: [
        'The service is provided without warranties of any kind. To the extent permitted by law, we are not liable for content posted by your server’s members or for damages caused by interruptions or errors of the service.',
        'Protection features are assistive tools and do not guarantee detection of all violating content.',
      ],
    },
    {
      heading: '6. Termination',
      paragraphs: [
        'You can remove the bot from your server at any time. We may suspend service to any server that violates these terms or abuses the service.',
      ],
    },
    {
      heading: '7. Changes to these terms',
      paragraphs: [
        'We may update these terms from time to time; continued use after an update constitutes acceptance. The last-updated date is shown at the top of this page.',
      ],
    },
    {
      heading: '8. Contact',
      paragraphs: ['For questions about these terms, contact us via the support server on Discord.'],
    },
  ],
};

export function Terms() {
  return <LegalPage content={{ ar, en }} />;
}
