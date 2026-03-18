# جدولة Refill التلقائي (داخل Supabase فقط)

لا حاجة لخدمات خارجية مثل cron-job.org. استخدم pg_cron + pg_net داخل Supabase.

## 1. تفعيل الامتدادات

من **Supabase Dashboard** > **Database** > **Extensions** فعّل:
- `pg_cron`
- `pg_net`

## 2. نشر Edge Function

```bash
npm run deploy:functions
```

## 3. تشغيل السكربت

افتح **SQL Editor** ونفّذ محتويات `schedule-refill-cron.sql`:

1. استبدل `YOUR_ANON_KEY` بمفتاح anon من **Project Settings** > **API**
2. نفّذ الأمر الأولين (vault.create_secret) مرة واحدة
3. نفّذ الأمر الثالث (cron.schedule)

## 4. التحقق

- **المهام المجدولة**: Dashboard > Database > Cron Jobs
- **سجلات الطلبات**: Dashboard > Edge Functions > refill-cron > Logs
