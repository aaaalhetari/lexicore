-- LexiCore: جدولة إعادة التعيين اليومية (منتصف الليل بتوقيت قطر UTC+3)
-- شغّل هذا الملف في Supabase SQL Editor بعد تفعيل pg_cron

select cron.schedule(
  'lexicore-daily-reset',
  '0 21 * * *',
  $$select public.daily_reset((now() at time zone 'Asia/Qatar')::date)$$
);
