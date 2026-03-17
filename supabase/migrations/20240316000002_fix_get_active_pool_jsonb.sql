-- Fix: cannot cast type record to jsonb in get_active_pool
-- Run this in Supabase SQL Editor if you see the error

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

  select count(*) from public.vocabulary
  where user_id = p_user_id and status = 'learning'
    and (case cycle
      when 1 then cycle_1_completed_date is null or cycle_1_completed_date <> v_today
      when 2 then cycle_2_completed_date is null or cycle_2_completed_date <> v_today
      when 3 then cycle_3_completed_date is null or cycle_3_completed_date <> v_today
      else true
    end)
  into v_learning_count;

  select count(*) from public.vocabulary
  where user_id = p_user_id and status = 'learning' and stage = 1
    and (case cycle when 1 then cycle_1_completed_date <> v_today or cycle_1_completed_date is null
         when 2 then cycle_2_completed_date <> v_today or cycle_2_completed_date is null
         when 3 then cycle_3_completed_date <> v_today or cycle_3_completed_date is null
         else true end)
  into v_stage1_count;

  select count(*) from public.vocabulary
  where user_id = p_user_id and status = 'learning' and stage = 2
    and (case cycle when 1 then cycle_1_completed_date <> v_today or cycle_1_completed_date is null
         when 2 then cycle_2_completed_date <> v_today or cycle_2_completed_date is null
         when 3 then cycle_3_completed_date <> v_today or cycle_3_completed_date is null
         else true end)
  into v_stage2_count;

  select count(*) from public.vocabulary
  where user_id = p_user_id and status = 'learning' and stage = 3
    and (case cycle when 1 then cycle_1_completed_date <> v_today or cycle_1_completed_date is null
         when 2 then cycle_2_completed_date <> v_today or cycle_2_completed_date is null
         when 3 then cycle_3_completed_date <> v_today or cycle_3_completed_date is null
         else true end)
  into v_stage3_count;

  if v_stage1_count <= 3 or v_stage2_count <= 3 or v_stage3_count <= 3 then
    v_to_promote := greatest(3 - least(v_stage1_count, v_stage2_count, v_stage3_count), 0);
    if v_to_promote > 0 then
      update public.vocabulary
      set status = 'learning', cycle = 1, stage = 1, consecutive_correct = 0
      where id in (
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
$$ language plpgsql security definer;
