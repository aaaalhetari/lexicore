-- LexiCore: جدولة Refill التلقائي (كل ساعة) — داخل Supabase فقط
-- المتطلبات: تفعيل pg_cron و pg_net من Dashboard > Database > Extensions

-- 1. تخزين المشروع والمفتاح في Vault (شغّل مرة واحدة فقط)
-- احصل على anon key من: Dashboard > Project Settings > API > anon public
select vault.create_secret('https://ryknnazacqzmasolhtkc.supabase.co', 'project_url');
select vault.create_secret('YOUR_ANON_KEY', 'anon_key');  -- استبدل YOUR_ANON_KEY

-- 2. جدولة استدعاء refill-cron كل ساعة
select cron.schedule(
  'lexicore-refill-cron',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/refill-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
