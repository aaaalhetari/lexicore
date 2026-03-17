-- LexiCore: Extend check_refill_needed to create audio jobs for words without audio
-- Ensures TTS is generated for reservoir-added and manually-added words

create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
declare
  v_waiting_count int;
  v_learning_count int;
begin
  select count(*) into v_waiting_count from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'waiting';

  -- Reservoir: add words when waiting pool is low
  if v_waiting_count < 10 then
    insert into public.refill_jobs (user_id, job_type, payload)
    values (p_user_id, 'reservoir', jsonb_build_object('count', 20));
  end if;

  -- Audio: create jobs for words without audio_url (max 10 per call to avoid overload)
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'audio', jsonb_build_object('word_id', v.id, 'word', v.word)
  from public.vocabulary v
  where v.user_id = p_user_id
    and v.audio_url is null
    and v.status in ('waiting', 'learning')
    and not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id
        and rj.job_type = 'audio'
        and (rj.payload->>'word_id')::bigint = v.id
        and rj.status in ('pending', 'processing')
    )
  limit 10;
end;
$$ language plpgsql security definer set search_path = '';
