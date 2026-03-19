# خطوات يدوية مطلوبة

تم تنفيذ كل التعديلات تلقائياً. الخطوة الوحيدة التي قد تحتاج يدك:

---

## إذا كنت تستخدم cron-job.org

حدّث الـ URL يدوياً:

1. ادخل إلى [cron-job.org](https://cron-job.org)
2. افتح المهمة "LexiCore Card Generation"
3. غيّر الـ URL من:
   ```
   https://YOUR_PROJECT.supabase.co/functions/v1/refill-cron
   ```
   إلى:
   ```
   https://YOUR_PROJECT.supabase.co/functions/v1/auto-add-cards
   ```
4. احفظ التغييرات

---

## إذا كنت تستخدم pg_cron داخل Supabase

تم تطبيق Migration `20240318000004_cron_use_auto_add_cards.sql` تلقائياً. الجدولة الآن تستدعي `auto-add-cards` بدل `refill-cron`.
