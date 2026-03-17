-- Fix: Function Search Path Mutable SECURITY
-- Run in Supabase SQL Editor to resolve security alerts
-- Adds set search_path = '' to all SECURITY DEFINER functions

-- 1. advance_cycles
create or replace function public.advance_cycles(p_user_id uuid)
returns void as $$
declare
  v_today date := current_date;
begin
  update public.vocabulary
  set cycle = case
    when cycle = 1 and cycle_1_completed_date is not null
      and (v_today - cycle_1_completed_date) >= 1 then 2
    when cycle = 2 and cycle_2_completed_date is not null
      and (v_today - cycle_2_completed_date) >= 1 then 3
    else cycle
  end,
  stage = case
    when cycle = 1 and cycle_1_completed_date is not null
      and (v_today - cycle_1_completed_date) >= 1 then 1
    when cycle = 2 and cycle_2_completed_date is not null
      and (v_today - cycle_2_completed_date) >= 1 then 1
    else stage
  end,
  consecutive_correct = case
    when cycle = 1 and cycle_1_completed_date is not null
      and (v_today - cycle_1_completed_date) >= 1 then 0
    when cycle = 2 and cycle_2_completed_date is not null
      and (v_today - cycle_2_completed_date) >= 1 then 0
    else consecutive_correct
  end
  where public.vocabulary.user_id = p_user_id and public.vocabulary.status = 'learning';
end;
$$ language plpgsql security definer set search_path = '';

-- 2. get_active_pool (includes jsonb fix)
create or replace function public.get_active_pool(p_user_id uuid)
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
  audio_url text,
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
      'new_words_per_session', us.new_words_per_session, 'pool_size', us.pool_size
    ) from public.user_settings us where us.user_id = p_user_id),
    '{"cycle_1":{"stage_1_required":4,"stage_2_required":4,"stage_3_required":4},
      "cycle_2":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "cycle_3":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "new_words_per_session":10,"pool_size":20}'::jsonb
  ) into v_settings;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'learning'
    and (case vc.cycle
      when 1 then vc.cycle_1_completed_date is null or vc.cycle_1_completed_date <> v_today
      when 2 then vc.cycle_2_completed_date is null or vc.cycle_2_completed_date <> v_today
      when 3 then vc.cycle_3_completed_date is null or vc.cycle_3_completed_date <> v_today
      else true
    end)
  into v_learning_count;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'learning' and vc.stage = 1
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
  into v_stage1_count;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'learning' and vc.stage = 2
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
  into v_stage2_count;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'learning' and vc.stage = 3
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
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
         v.audio_url, v.cycle_1_completed_date, v.cycle_2_completed_date, v.cycle_3_completed_date
  from public.vocabulary v
  where v.user_id = p_user_id and v.status = 'learning'
    and (case v.cycle
      when 1 then v.cycle_1_completed_date is null or v.cycle_1_completed_date <> v_today
      when 2 then v.cycle_2_completed_date is null or v.cycle_2_completed_date <> v_today
      when 3 then v.cycle_3_completed_date is null or v.cycle_3_completed_date <> v_today
      else true
    end)
  order by v.id
  limit 10;
end;
$$ language plpgsql security definer set search_path = '';

-- 3. submit_answer
create or replace function public.submit_answer(
  p_user_id uuid,
  p_word_id bigint,
  p_correct boolean
)
returns jsonb as $$
declare
  v_word record;
  v_settings jsonb;
  v_required int;
  v_today date := current_date;
  v_result jsonb;
begin
  select * into v_word from public.vocabulary
  where id = p_word_id and user_id = p_user_id;
  if not found then
    return jsonb_build_object('error', 'word_not_found');
  end if;

  select coalesce(
    (select jsonb_build_object(
      'cycle_1', us.cycle_1, 'cycle_2', us.cycle_2, 'cycle_3', us.cycle_3
    ) from public.user_settings us where us.user_id = p_user_id),
    '{"cycle_1":{"stage_1_required":4,"stage_2_required":4,"stage_3_required":4},
      "cycle_2":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "cycle_3":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2}}'::jsonb
  ) into v_settings;

  v_required := coalesce(
    (v_settings #> array['cycle_'||v_word.cycle, 'stage_'||v_word.stage||'_required'])::text::int,
    4
  );

  if p_correct then
    if v_word.consecutive_correct + 1 >= v_required then
      if v_word.stage < 3 then
        update public.vocabulary
        set stage = v_word.stage + 1, consecutive_correct = 0
        where id = p_word_id and user_id = p_user_id;
        v_result := jsonb_build_object('type', 'stage_advance', 'stage', v_word.stage + 1);
      else
        if v_word.cycle < 3 then
          update public.vocabulary
          set cycle_1_completed_date = case when v_word.cycle = 1 then v_today else cycle_1_completed_date end,
              cycle_2_completed_date = case when v_word.cycle = 2 then v_today else cycle_2_completed_date end,
              cycle_3_completed_date = case when v_word.cycle = 3 then v_today else cycle_3_completed_date end,
              cycle = v_word.cycle + 1, stage = 1, consecutive_correct = 0
          where id = p_word_id and user_id = p_user_id;
          v_result := jsonb_build_object('type', 'cycle_complete', 'cycle', v_word.cycle);
        else
          update public.vocabulary
          set status = 'mastered', cycle_3_completed_date = v_today
          where id = p_word_id and user_id = p_user_id;
          v_result := jsonb_build_object('type', 'mastered', 'word', v_word.word);
        end if;
      end if;
    else
      update public.vocabulary set consecutive_correct = consecutive_correct + 1
      where id = p_word_id and user_id = p_user_id;
      v_result := jsonb_build_object('type', 'correct',
        'count', v_word.consecutive_correct + 1, 'required', v_required);
    end if;
  else
    update public.vocabulary set consecutive_correct = 0
    where id = p_word_id and user_id = p_user_id;
    v_result := jsonb_build_object('type', 'wrong');
  end if;

  return v_result;
end;
$$ language plpgsql security definer set search_path = '';

-- 4. check_refill_needed
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
end;
$$ language plpgsql security definer set search_path = '';
