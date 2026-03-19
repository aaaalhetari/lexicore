-- Atomic job claiming: prevents duplicate processing when multiple workers run concurrently.
-- Uses FOR UPDATE SKIP LOCKED to safely claim pending jobs without race conditions.

-- Reset stuck "processing" jobs (from timed-out runs)
create or replace function public.reset_stuck_card_jobs()
returns void as $$
begin
  update public.card_jobs
  set status = 'pending'
  where status = 'processing';

  update public.card_jobs
  set status = 'pending'
  where status = 'failed'
    and processed_at < now() - interval '1 hour';
end;
$$ language plpgsql security definer set search_path = '';

-- Claim up to p_limit pending jobs atomically.
-- Optionally filter by p_user_id (NULL = any user).
-- Returns claimed rows with status already set to 'processing'.
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
  set status = 'processing'
  from claimed c
  where j.id = c.id
  returning j.id, j.user_id, j.job_type, j.payload;
end;
$$ language plpgsql security definer set search_path = '';

-- Mark a job as done
create or replace function public.complete_card_job(p_job_id bigint)
returns void as $$
begin
  update public.card_jobs
  set status = 'done', processed_at = now()
  where id = p_job_id;
end;
$$ language plpgsql security definer set search_path = '';

-- Mark a job as failed
create or replace function public.fail_card_job(p_job_id bigint)
returns void as $$
begin
  update public.card_jobs
  set status = 'failed', processed_at = now()
  where id = p_job_id;
end;
$$ language plpgsql security definer set search_path = '';
