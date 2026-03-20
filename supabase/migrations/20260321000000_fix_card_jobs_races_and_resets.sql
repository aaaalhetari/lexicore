-- LexiCore: Stop duplicate add_more_words rows and parallel re-claims of in-flight jobs
-- Fixes: (1) TOCTOU on INSERT despite NOT EXISTS, (2) reset_stuck_card_jobs resetting ALL processing every run.

-- 1) When a job is claimed, we record time; only jobs stuck in processing get reset to pending.
alter table public.card_jobs
  add column if not exists processing_started_at timestamptz;

-- 2) Remove duplicate active add_more_words (keep one per user: prefer processing, else oldest id)
with ranked as (
  select id,
         row_number() over (
           partition by user_id
           order by case when status = 'processing' then 0 else 1 end,
                    id
         ) as rn
  from public.card_jobs
  where job_type = 'add_more_words'
    and status in ('pending', 'processing')
)
delete from public.card_jobs c
using ranked r
where c.id = r.id
  and r.rn > 1;

-- 3) At most one pending/processing add_more_words per user (DB-enforced)
create unique index if not exists card_jobs_one_active_add_more_words_per_user
  on public.card_jobs (user_id)
  where job_type = 'add_more_words'
    and status in ('pending', 'processing');

create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
declare
  v_waiting_count int;
  v_new_words_per_day int;
  v_waiting_target int;
begin
  select coalesce(us.new_words_per_day, 25), coalesce(us.waiting_target, 50)
  into v_new_words_per_day, v_waiting_target
  from public.user_settings us where us.user_id = p_user_id;

  if v_new_words_per_day is null then v_new_words_per_day := 25; end if;
  if v_waiting_target is null then v_waiting_target := 50; end if;

  select count(*) into v_waiting_count from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'waiting';

  if v_waiting_count < v_waiting_target then
    perform pg_advisory_xact_lock(
      1584729031,
      hashtext('lex:add_more_words:' || p_user_id::text)
    );
    insert into public.card_jobs (user_id, job_type, payload)
    values (
      p_user_id,
      'add_more_words',
      jsonb_build_object('count', greatest(1, v_new_words_per_day))
    )
    on conflict (user_id)
      where (job_type = 'add_more_words' and status in ('pending', 'processing'))
    do nothing;
  end if;

  insert into public.card_jobs (user_id, job_type, payload)
  select v.user_id, 'add_card_sound', jsonb_build_object('word_id', v.id, 'word', v.word)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and (
      v.audio_word is null
      or coalesce(jsonb_array_length(v.audio_stage1_definitions), 0) = 0
    )
    and not exists (
      select 1 from public.card_jobs rj
      where rj.user_id = v.user_id
        and rj.job_type = 'add_card_sound'
        and (rj.payload->>'word_id')::bigint = v.id
        and rj.status in ('pending', 'processing')
    )
  limit 50;

  insert into public.card_jobs (user_id, job_type, payload)
  select v.user_id, 'make_card_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 1)
  from public.vocabulary v
  where v.user_id = p_user_id
    and coalesce(jsonb_array_length(v.stage1_definitions), 0) = 0
    and not exists (
      select 1 from public.card_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 1
        and rj.status in ('pending', 'processing')
    )
  limit 20;

  insert into public.card_jobs (user_id, job_type, payload)
  select v.user_id, 'make_card_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 2)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and coalesce(jsonb_array_length(v.stage2_sentences), 0) = 0
    and not exists (
      select 1 from public.card_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 2
        and rj.status in ('pending', 'processing')
    )
  limit 20;

  insert into public.card_jobs (user_id, job_type, payload)
  select v.user_id, 'make_card_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 3)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and jsonb_array_length(coalesce(v.stage2_sentences, '[]'::jsonb)) > 0
    and (
      coalesce(jsonb_array_length(v.stage3_correct), 0) = 0
      or coalesce(jsonb_array_length(v.stage3_incorrect), 0) = 0
    )
    and not exists (
      select 1 from public.card_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 3
        and rj.status in ('pending', 'processing')
    )
  limit 20;
end;
$$ language plpgsql security definer set search_path = '';

-- Only reset processing jobs that have been stuck for a while (not every in-flight job each run).
create or replace function public.reset_stuck_card_jobs()
returns void as $$
begin
  update public.card_jobs
  set status = 'pending',
      processing_started_at = null
  where status = 'processing'
    and coalesce(processing_started_at, created_at) < now() - interval '45 minutes';

  update public.card_jobs
  set status = 'pending',
      processing_started_at = null
  where status = 'failed'
    and processed_at < now() - interval '1 hour';
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.claim_card_jobs(
  p_limit int default 6,
  p_user_id uuid default null
)
returns table (
  id bigint,
  user_id uuid,
  job_type text,
  payload jsonb
) as $$
begin
  return query
  with claimed as (
    select cj.id
    from public.card_jobs cj
    where cj.status = 'pending'
      and (p_user_id is null or cj.user_id = p_user_id)
    order by
      case cj.job_type
        when 'add_card_sound' then 1
        when 'make_card_content' then 2
        when 'add_more_words' then 3
        else 4
      end,
      cj.id
    limit p_limit
    for update skip locked
  )
  update public.card_jobs j
  set status = 'processing',
      processing_started_at = now()
  from claimed c
  where j.id = c.id
  returning j.id, j.user_id, j.job_type, j.payload;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.complete_card_job(p_job_id bigint)
returns void as $$
begin
  update public.card_jobs
  set status = 'done',
      processed_at = now(),
      processing_started_at = null
  where id = p_job_id;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.fail_card_job(p_job_id bigint)
returns void as $$
begin
  update public.card_jobs
  set status = 'failed',
      processed_at = now(),
      processing_started_at = null
  where id = p_job_id;
end;
$$ language plpgsql security definer set search_path = '';

-- Observability: clearer dedupe_key for add_more_words (nullable-safe display)
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
