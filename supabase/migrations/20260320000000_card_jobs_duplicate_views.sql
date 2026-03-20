-- LexiCore: Observability — detect duplicate card_jobs (same logical work queued or completed twice+)
-- Run after migrations; query from SQL Editor (service_role sees all users) or app (RLS on card_jobs).

-- Active queue: more than one pending/processing row for the same logical job
create or replace view public.v_card_jobs_active_duplicates
with (security_invoker = true) as
with active as (
  select *
  from public.card_jobs
  where status in ('pending', 'processing')
),
keys as (
  select
    id,
    user_id,
    job_type,
    status,
    created_at,
    payload,
    case job_type
      when 'add_more_words' then 'add_more_words'
      when 'add_card_sound' then coalesce(payload->>'word_id', '')
      when 'make_card_content' then coalesce(payload->>'word_id', '') || ':' || coalesce(payload->>'stage', '')
      else job_type || ':' || id::text
    end as dedupe_key
  from active
),
grouped as (
  select user_id, job_type, dedupe_key, count(*) as grp_size
  from keys
  group by user_id, job_type, dedupe_key
  having count(*) > 1
)
select
  k.id,
  k.user_id,
  k.job_type,
  k.status,
  k.created_at,
  k.payload,
  k.dedupe_key,
  g.grp_size as duplicate_group_size
from keys k
join grouped g using (user_id, job_type, dedupe_key)
order by k.user_id, k.job_type, k.dedupe_key, k.created_at;

comment on view public.v_card_jobs_active_duplicates is
  'Rows in pending/processing that share the same user + job kind + logical target (e.g. same word_id for sound) with grp_size > 1.';

-- Historical: add_card_sound completed more than once per vocabulary row (duplicate TTS runs)
create or replace view public.v_card_jobs_history_sound_multi_done
with (security_invoker = true) as
select
  user_id,
  (payload->>'word_id')::bigint as word_id,
  count(*) filter (where status = 'done') as done_runs,
  count(*) filter (where status = 'failed') as failed_runs,
  count(*) filter (where status in ('pending', 'processing')) as active_runs,
  min(created_at) as first_enqueued_at,
  max(processed_at) as last_finished_at
from public.card_jobs
where job_type = 'add_card_sound'
  and nullif(trim(payload->>'word_id'), '') is not null
group by user_id, (payload->>'word_id')::bigint
having count(*) filter (where status = 'done') > 1;

comment on view public.v_card_jobs_history_sound_multi_done is
  'Vocabulary ids where add_card_sound finished (done) more than once — indicates repeated full TTS work.';

-- Historical: make_card_content finished more than once for same word + stage
create or replace view public.v_card_jobs_history_content_multi_done
with (security_invoker = true) as
select
  user_id,
  (payload->>'word_id')::bigint as word_id,
  (payload->>'stage')::int as stage,
  count(*) filter (where status = 'done') as done_runs,
  count(*) filter (where status = 'failed') as failed_runs,
  min(created_at) as first_enqueued_at,
  max(processed_at) as last_finished_at
from public.card_jobs
where job_type = 'make_card_content'
  and nullif(trim(payload->>'word_id'), '') is not null
  and nullif(trim(payload->>'stage'), '') is not null
group by user_id, (payload->>'word_id')::bigint, (payload->>'stage')::int
having count(*) filter (where status = 'done') > 1;

comment on view public.v_card_jobs_history_content_multi_done is
  'Word id + stage where make_card_content completed (done) more than once.';

grant select on public.v_card_jobs_active_duplicates to authenticated;
grant select on public.v_card_jobs_active_duplicates to service_role;
grant select on public.v_card_jobs_history_sound_multi_done to authenticated;
grant select on public.v_card_jobs_history_sound_multi_done to service_role;
grant select on public.v_card_jobs_history_content_multi_done to authenticated;
grant select on public.v_card_jobs_history_content_multi_done to service_role;
