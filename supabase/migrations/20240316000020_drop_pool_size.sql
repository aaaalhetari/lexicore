-- Drop pool_size column, use new_words_per_session only. Default 50.
alter table public.user_settings alter column new_words_per_session set default 50;
alter table public.user_settings drop column if exists pool_size;

-- Update get_active_pool: remove pool_size from settings
drop function if exists public.get_active_pool(uuid);
create function public.get_active_pool(p_user_id uuid)
returns table (
  id bigint,
  word text,
  status text,
  cycle smallint,
  stage smallint,
  consecutive_correct smallint,
  stage1_definitions jsonb,
  stage2_sentences jsonb,
  stage3_correct jsonb,
  stage3_incorrect jsonb,
  audio_word text,
  audio_stage1_definitions jsonb,
  audio_stage2_sentences jsonb,
  audio_stage3_correct jsonb,
  audio_stage3_incorrect jsonb,
  cycle_1_completed_date date,
  cycle_2_completed_date date,
  cycle_3_completed_date date
) as $$
declare
  v_today date := current_date;
  v_settings jsonb;
  v_learning_count int;
  v_stage1_count int;
  v_stage2_count int;
  v_stage3_count int;
  v_waiting_count int;
  v_to_promote int;
begin
  perform public.advance_cycles(p_user_id);

  select coalesce(
    (select jsonb_build_object(
      'cycle_1', us.cycle_1, 'cycle_2', us.cycle_2, 'cycle_3', us.cycle_3,
      'new_words_per_session', us.new_words_per_session
    ) from public.user_settings us where us.user_id = p_user_id),
    '{"cycle_1":{"stage_1_required":4,"stage_2_required":4,"stage_3_required":4},
      "cycle_2":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "cycle_3":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "new_words_per_session":50}'::jsonb
  ) into v_settings;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'learning'
    and (case vc.cycle
      when 1 then vc.cycle_1_completed_date is null or vc.cycle_1_completed_date <> v_today
      when 2 then vc.cycle_2_completed_date is null or vc.cycle_2_completed_date <> v_today
      when 3 then vc.cycle_3_completed_date is null or vc.cycle_3_completed_date <> v_today
      else true
    end)
    and coalesce(vc.cycle_1_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_2_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_3_completed_date, '1900-01-01'::date) <> v_today
  into v_learning_count;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'learning' and vc.stage = 1
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
    and coalesce(vc.cycle_1_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_2_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_3_completed_date, '1900-01-01'::date) <> v_today
  into v_stage1_count;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'learning' and vc.stage = 2
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
    and coalesce(vc.cycle_1_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_2_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_3_completed_date, '1900-01-01'::date) <> v_today
  into v_stage2_count;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'learning' and vc.stage = 3
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
    and coalesce(vc.cycle_1_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_2_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_3_completed_date, '1900-01-01'::date) <> v_today
  into v_stage3_count;

  if v_stage1_count <= 3 or v_stage2_count <= 3 or v_stage3_count <= 3 then
    v_to_promote := greatest(3 - least(v_stage1_count, v_stage2_count, v_stage3_count), 0);
    if v_to_promote > 0 then
      update public.vocabulary
      set status = 'learning', cycle = 1, stage = 1, consecutive_correct = 0
      where public.vocabulary.id in (
        select v2.id from public.vocabulary v2
        where v2.user_id = p_user_id and v2.status = 'waiting'
        order by v2.id
        limit v_to_promote
      );
    end if;
  end if;

  return query
  select v.id, v.word, v.status, v.cycle, v.stage, v.consecutive_correct,
         v.stage1_definitions, v.stage2_sentences, v.stage3_correct, v.stage3_incorrect,
         v.audio_word,
         coalesce(v.audio_stage1_definitions, '[]'::jsonb),
         coalesce(v.audio_stage2_sentences, '[]'::jsonb),
         coalesce(v.audio_stage3_correct, '[]'::jsonb),
         coalesce(v.audio_stage3_incorrect, '[]'::jsonb),
         v.cycle_1_completed_date, v.cycle_2_completed_date, v.cycle_3_completed_date
  from public.vocabulary v
  where v.user_id = p_user_id and v.status = 'learning'
    and (case v.cycle
      when 1 then v.cycle_1_completed_date is null or v.cycle_1_completed_date <> v_today
      when 2 then v.cycle_2_completed_date is null or v.cycle_2_completed_date <> v_today
      when 3 then v.cycle_3_completed_date is null or v.cycle_3_completed_date <> v_today
      else true
    end)
    and coalesce(v.cycle_1_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(v.cycle_2_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(v.cycle_3_completed_date, '1900-01-01'::date) <> v_today
  order by v.id
  limit greatest(1, coalesce((v_settings->>'new_words_per_session')::int, 50));
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.get_active_pool(uuid) to authenticated;

-- Update check_refill_needed: remove pool_size reference
create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
declare
  v_waiting_count int;
  v_words_per_session int;
begin
  select coalesce(us.new_words_per_session, 50) into v_words_per_session
  from public.user_settings us
  where us.user_id = p_user_id;

  select count(*) into v_waiting_count from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'waiting';

  if v_waiting_count < 10 then
    insert into public.refill_jobs (user_id, job_type, payload)
    values (p_user_id, 'reservoir', jsonb_build_object('count', greatest(1, v_words_per_session)));
  end if;

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
