-- LexiCore: توليد تلقائي لكل محتوى فارغ (قديم/جديد/فاشل)
-- 1. tts_content: جميع الحالات بما فيها mastered، حد 50
-- 2. stage_content: للكلمات ذات محتوى نصي فارغ
-- 3. إعادة محاولة المهام الفاشلة تتم في process-refill

create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
declare
  v_waiting_count int;
  v_new_words_per_day int;
  v_reservoir int;
begin
  select coalesce(us.new_words_per_day, 25), coalesce(us.reservoir, 50)
  into v_new_words_per_day, v_reservoir
  from public.user_settings us where us.user_id = p_user_id;

  if v_new_words_per_day is null then v_new_words_per_day := 25; end if;
  if v_reservoir is null then v_reservoir := 50; end if;

  select count(*) into v_waiting_count from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'waiting';

  -- Reservoir job when waiting < target
  if v_waiting_count < v_reservoir then
    if not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = p_user_id and rj.job_type = 'reservoir'
        and rj.status in ('pending', 'processing')
    ) then
      insert into public.refill_jobs (user_id, job_type, payload)
      values (p_user_id, 'reservoir', jsonb_build_object('count', greatest(1, v_new_words_per_day)));
    end if;
  end if;

  -- tts_content: جميع الحالات (بما فيها mastered)، حد 50
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'tts_content', jsonb_build_object('word_id', v.id, 'word', v.word)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and (
      v.audio_word is null
      or coalesce(jsonb_array_length(v.audio_stage1_definitions), 0) = 0
    )
    and not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id
        and rj.job_type = 'tts_content'
        and (rj.payload->>'word_id')::bigint = v.id
        and rj.status in ('pending', 'processing')
    )
  limit 50;

  -- stage_content stage 1: كلمات بدون تعريفات
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'stage_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 1)
  from public.vocabulary v
  where v.user_id = p_user_id
    and coalesce(jsonb_array_length(v.stage1_definitions), 0) = 0
    and not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'stage_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 1
        and rj.status in ('pending', 'processing')
    )
  limit 20;

  -- stage_content stage 2: كلمات بدون جمل (ولديها تعريفات)
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'stage_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 2)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and coalesce(jsonb_array_length(v.stage2_sentences), 0) = 0
    and not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'stage_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 2
        and rj.status in ('pending', 'processing')
    )
  limit 20;

  -- stage_content stage 3: كلمات بدون جمل صحيحة/خاطئة (ولديها مراحل 1 و 2)
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'stage_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 3)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and jsonb_array_length(coalesce(v.stage2_sentences, '[]'::jsonb)) > 0
    and (
      coalesce(jsonb_array_length(v.stage3_correct), 0) = 0
      or coalesce(jsonb_array_length(v.stage3_incorrect), 0) = 0
    )
    and not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'stage_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 3
        and rj.status in ('pending', 'processing')
    )
  limit 20;
end;
$$ language plpgsql security definer set search_path = '';
