# تشغيل Cron تلقائياً (Refill + TTS)

لتشغيل `refill-cron` تلقائياً كل ساعة (توليد المحتوى والصوتيات في الخلفية):

## الطريقة 1: cron-job.org (الأبسط)

1. **انشر الدالة** (إن لم تكن منشورة):
   ```bash
   npx supabase functions deploy refill-cron --no-verify-jwt
   ```

2. **افتح** [cron-job.org](https://cron-job.org) وسجّل دخولاً (مجاني).

3. **أنشئ مهمة جديدة**:
   - **Title:** LexiCore Refill
   - **URL:** `https://YOUR_PROJECT.supabase.co/functions/v1/refill-cron`
   - **Method:** POST
   - **Headers:** أضف:
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer YOUR_ANON_KEY`
   - **Schedule:** كل ساعة (مثلاً `0 * * * *`)

4. **احفظ** المهمة.

---

## الطريقة 2: pg_cron داخل Supabase

1. **فعّل الإضافات** من Supabase Dashboard → Database → Extensions:
   - `pg_cron`
   - `pg_net`

2. **نفّذ** migration `20240317000004_schedule_refill_cron.sql` من SQL Editor.

   ⚠️ قد تحتاج لتعديل الـ URL والمفتاح في الملف ليتوافق مع مشروعك.

---

## ماذا يفعل refill-cron؟

1. يستدعي `check_refill_needed` لكل المستخدمين (يضيف مهام reservoir + tts_content)
2. يستدعي `process-refill` حتى 30 مرة لمعالجة المهام
3. النتيجة: توليد المحتوى النصي للكلمات الفارغة + توليد الصوتيات للكلمات التي لها محتوى وليس لها صوت
