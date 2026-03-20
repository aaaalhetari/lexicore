-- LexiCore: Persist last failure reason on card_jobs for SQL Editor / debugging.
-- run-card-jobs passes p_message when marking failed; complete clears last_error.

alter table public.card_jobs
  add column if not exists last_error text;

comment on column public.card_jobs.last_error is
  'Set when status becomes failed (truncate ~2k). Cleared on complete_card_job.';

create or replace function public.complete_card_job(p_job_id bigint)
returns void as $$
begin
  update public.card_jobs
  set status = 'done',
      processed_at = now(),
      processing_started_at = null,
      last_error = null
  where id = p_job_id;
end;
$$ language plpgsql security definer set search_path = '';

drop function if exists public.fail_card_job(bigint);

create or replace function public.fail_card_job(
  p_job_id bigint,
  p_message text default null
)
returns void as $$
declare
  v_msg text;
begin
  v_msg := nullif(trim(coalesce(p_message, '')), '');
  if v_msg is not null and length(v_msg) > 2000 then
    v_msg := left(v_msg, 2000);
  end if;

  update public.card_jobs
  set status = 'failed',
      processed_at = now(),
      processing_started_at = null,
      last_error = v_msg
  where id = p_job_id;
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.fail_card_job(bigint, text) to service_role;

-- Clear stale errors when stuck/failed jobs are returned to the queue for retry.
create or replace function public.reset_stuck_card_jobs()
returns void as $$
begin
  update public.card_jobs
  set status = 'pending',
      processing_started_at = null,
      last_error = null
  where status = 'processing'
    and coalesce(processing_started_at, created_at) < now() - interval '45 minutes';

  update public.card_jobs
  set status = 'pending',
      processing_started_at = null,
      last_error = null
  where status = 'failed'
    and processed_at < now() - interval '1 hour';
end;
$$ language plpgsql security definer set search_path = '';
