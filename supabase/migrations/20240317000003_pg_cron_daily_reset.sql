-- pg_cron: daily reset at 21:00 UTC = 00:00 Qatar (UTC+3)
-- 1. Enable pg_cron in Supabase Dashboard > Database > Extensions
-- 2. Run in SQL Editor:
--    select cron.schedule('lexicore-daily-reset', '0 21 * * *', $$select public.daily_reset((now() at time zone 'Asia/Qatar')::date)$$);
select 1;
