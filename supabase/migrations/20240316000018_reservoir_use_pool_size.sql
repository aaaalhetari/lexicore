-- Use pool_size from user_settings for reservoir count (instead of hardcoded 20)
create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
declare
  v_waiting_count int;
  v_learning_count int;
  v_pool_size int;
begin
  select coalesce(us.pool_size, 20) into v_pool_size
  from public.user_settings us
  where us.user_id = p_user_id;

  select count(*) into v_waiting_count from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'waiting';

  if v_waiting_count < 10 then
    insert into public.refill_jobs (user_id, job_type, payload)
    values (p_user_id, 'reservoir', jsonb_build_object('count', greatest(1, v_pool_size)));
  end if;

  -- TTS: create jobs for words with content but missing/incomplete audio
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'tts_content', jsonb_build_object('word_id', v.id, 'word', v.word)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and (
      v.audio_word is null
      or coalesce(jsonb_array_length(v.audio_stage1_definitions), 0) = 0
    )
    and v.status in ('waiting', 'learning')
    and not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id
        and rj.job_type = 'tts_content'
        and (rj.payload->>'word_id')::bigint = v.id
        and rj.status in ('pending', 'processing')
    )
  limit 20;
end;
$$ language plpgsql security definer set search_path = '';
