-- Remove stage3_audio column (replaced by audio_stage3_correct, audio_stage3_incorrect)
alter table public.vocabulary drop column if exists stage3_audio;

-- Add tts_content job type for generating all TTS for a word
alter table public.refill_jobs drop constraint if exists refill_jobs_job_type_check;
alter table public.refill_jobs add constraint refill_jobs_job_type_check
  check (job_type in ('reservoir', 'stage_content', 'audio', 'tts_content'));

-- Update check_refill_needed: use tts_content for words with content but missing audio
create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
declare
  v_waiting_count int;
  v_learning_count int;
begin
  select count(*) into v_waiting_count from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'waiting';

  if v_waiting_count < 10 then
    insert into public.refill_jobs (user_id, job_type, payload)
    values (p_user_id, 'reservoir', jsonb_build_object('count', 20));
  end if;

  -- TTS: create jobs for words with content but missing/incomplete audio
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'tts_content', jsonb_build_object('word_id', v.id, 'word', v.word)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and (
      coalesce(v.audio_word, v.audio_url) is null
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
