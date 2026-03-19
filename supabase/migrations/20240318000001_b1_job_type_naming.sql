-- B1-friendly job_type naming: reservoir->add_more_words, stage_content->make_card_content, tts_content->add_card_sound

-- 1. Drop old constraint first (so UPDATE can use new values)
alter table public.refill_jobs drop constraint if exists refill_jobs_job_type_check;

-- 2. Update existing rows
update public.refill_jobs set job_type = 'add_more_words' where job_type = 'reservoir';
update public.refill_jobs set job_type = 'make_card_content' where job_type = 'stage_content';
update public.refill_jobs set job_type = 'add_card_sound' where job_type in ('tts_content', 'audio');

-- 3. Add new constraint
alter table public.refill_jobs add constraint refill_jobs_job_type_check
  check (job_type in ('add_more_words', 'make_card_content', 'add_card_sound'));

-- 3. Replace check_refill_needed to use new job_type values
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

  if v_waiting_count < v_reservoir then
    if not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = p_user_id and rj.job_type = 'add_more_words'
        and rj.status in ('pending', 'processing')
    ) then
      insert into public.refill_jobs (user_id, job_type, payload)
      values (p_user_id, 'add_more_words', jsonb_build_object('count', greatest(1, v_new_words_per_day)));
    end if;
  end if;

  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'add_card_sound', jsonb_build_object('word_id', v.id, 'word', v.word)
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
        and rj.job_type = 'add_card_sound'
        and (rj.payload->>'word_id')::bigint = v.id
        and rj.status in ('pending', 'processing')
    )
  limit 50;

  -- make_card_content stage 1
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'make_card_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 1)
  from public.vocabulary v
  where v.user_id = p_user_id
    and coalesce(jsonb_array_length(v.stage1_definitions), 0) = 0
    and not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 1
        and rj.status in ('pending', 'processing')
    )
  limit 20;

  -- make_card_content stage 2
  insert into public.refill_jobs (user_id, job_type, payload)
  select v.user_id, 'make_card_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 2)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and coalesce(jsonb_array_length(v.stage2_sentences), 0) = 0
    and not exists (
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 2
        and rj.status in ('pending', 'processing')
    )
  limit 20;

  -- make_card_content stage 3
  insert into public.refill_jobs (user_id, job_type, payload)
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
      select 1 from public.refill_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 3
        and rj.status in ('pending', 'processing')
    )
  limit 20;
end;
$$ language plpgsql security definer set search_path = '';

