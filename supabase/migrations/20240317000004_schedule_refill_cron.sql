-- LexiCore: جدولة refill-cron كل ساعة عبر pg_cron + pg_net
-- المتطلبات: pg_cron و pg_net مفعّلان

-- 1. تخزين المشروع والمفتاح في Vault
select vault.create_secret('https://ryknnazacqzmasolhtkc.supabase.co', 'project_url');
select vault.create_secret('sb_publishable_R3ZESGRgnFgpnTf-CFqlAw_0f4TjRZS', 'anon_key');

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
