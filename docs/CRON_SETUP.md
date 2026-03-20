# جدولة التوليد التلقائي

تشغيل دالة Edge **`auto-add-cards`** بشكل دوري لملء طابور `card_jobs` وتصريفه (محتوى + صوت).

## الإعداد المتوقع في Supabase

في **Dashboard → Integrations → Cron** (أو `select * from cron.job;`) يجب أن ترى على الأقل:

| المهمة | الدور المعتاد |
|--------|----------------|
| **`lexicore-auto-add-cards`** | كل ساعة — `net.http_post` إلى `…/functions/v1/auto-add-cards` |
| **`lexicore-daily-reset`** | يومي — `public.daily_reset` حسب منطقة زمنية المشروع |

فعّل **`pg_cron`** و **`pg_net`** من **Database → Extensions** إن لزم.

## المسارات والنشر

1. طبّق الـ migrations بالترتيب: `npx supabase db push` (من مجلد `lexicore`).
2. انشر الدوال: `npm run deploy:functions`.

قائمة الدوال المعتمدة: [`docs/EDGE_FUNCTIONS.md`](EDGE_FUNCTIONS.md).

## ماذا تفعل `auto-add-cards`؟

1. تستدعي `check_card_jobs_needed` لكل مستخدم (تعبئة مهام عند الحاجة).
2. تستدعي `run-card-jobs` في حلقة حتى يفرغ الطابور أو يتوقف التقدم.
3. النتيجة: كلمات مع محتوى وصوت يُكمَل في الخلفية.

## مراحل البطاقة (مرجع)

| المرحلة | المحتوى |
|---------|--------|
| Stage 1 | Definition |
| Stage 2 | Gap-fill |
| Stage 3 | Usage judgment |
