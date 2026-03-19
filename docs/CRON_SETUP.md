# جدولة التوليد التلقائي (Card Generation Cron)

لتشغيل `auto-add-cards` كل ساعة — توليد محتوى البطاقات وصوتياتها في الخلفية.

## مراحل التطبيق (App Stages)

| المرحلة | المحتوى |
|---------|---------|
| Stage 1 | Definition — اختيار التعريف الصحيح |
| Stage 2 | Gap-fill — ملء الفراغ في الجملة |
| Stage 3 | Usage judgment — الحكم على صحة الاستخدام |

## الطريقة 1: cron-job.org (الأبسط)

1. **انشر الدالة**:
   ```bash
   npx supabase functions deploy auto-add-cards --no-verify-jwt
   ```

2. **افتح** [cron-job.org](https://cron-job.org) وسجّل دخولاً (مجاني).

3. **أنشئ مهمة جديدة**:
   - **Title:** LexiCore Card Generation
   - **URL:** `https://YOUR_PROJECT.supabase.co/functions/v1/auto-add-cards`
   - **Method:** POST
   - **Headers:** `Content-Type: application/json`, `Authorization: Bearer YOUR_ANON_KEY`
   - **Schedule:** كل ساعة (`0 * * * *`)

4. **احفظ** المهمة.

---

## الطريقة 2: pg_cron داخل Supabase

1. **فعّل** `pg_cron` و `pg_net` من Database → Extensions.
2. **نفّذ** migration `20240317000004_schedule_refill_cron.sql` من SQL Editor.

---

## ماذا يفعل auto-add-cards؟

1. `check_refill_needed`: يضيف مهام لكل مستخدم
   - **add_more_words**: توسيع مخزون الكلمات في الانتظار
   - **add_card_sound**: صوتيات البطاقات (Stage 1+2+3)
2. `run-card-jobs`: يعالج المهام (محتوى المراحل + صوتيات)
3. النتيجة: كلمات جاهزة للدراسة مع محتوى وصوتيات كاملة
