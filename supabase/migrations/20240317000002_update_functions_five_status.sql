-- Update all functions for 5-status system
-- learning -> learning_today | learning_before_today
-- Pool = new_word + learning_today + learning_before_today
-- Promote: waiting -> new_word (when stage counts low)

-- 1. advance_cycles: learning_today + learning_before_today
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
  where public.vocabulary.user_id = p_user_id
    and public.vocabulary.status in ('learning_today', 'learning_before_today');
end;
$$ language plpgsql security definer set search_path = '';

-- 2. get_active_pool: pool = new_word + learning_today + learning_before_today; promote waiting -> new_word
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
  v_stage1_count int;
  v_stage2_count int;
  v_stage3_count int;
  v_new_word_count int;
  v_learning_today_count int;
  v_to_promote int;
  v_new_words_per_day int;
  v_reservoir int;
begin
  perform public.advance_cycles(p_user_id);

  select coalesce(
    (select jsonb_build_object(
      'cycle_1', us.cycle_1, 'cycle_2', us.cycle_2, 'cycle_3', us.cycle_3,
      'new_words_per_session', us.new_words_per_session,
      'new_words_per_day', us.new_words_per_day, 'reservoir', us.reservoir
    ) from public.user_settings us where us.user_id = p_user_id),
    '{"cycle_1":{"stage_1_required":4,"stage_2_required":4,"stage_3_required":4},
      "cycle_2":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "cycle_3":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "new_words_per_session":50,"new_words_per_day":25,"reservoir":50}'::jsonb
  ) into v_settings;

  v_new_words_per_day := coalesce((v_settings->>'new_words_per_day')::int, 25);
  v_reservoir := coalesce((v_settings->>'reservoir')::int, 50);

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status in ('learning_today', 'learning_before_today') and vc.stage = 1
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
    and coalesce(vc.cycle_1_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_2_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_3_completed_date, '1900-01-01'::date) <> v_today
  into v_stage1_count;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status in ('learning_today', 'learning_before_today') and vc.stage = 2
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
    and coalesce(vc.cycle_1_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_2_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_3_completed_date, '1900-01-01'::date) <> v_today
  into v_stage2_count;

  select count(*) from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status in ('learning_today', 'learning_before_today') and vc.stage = 3
    and (case vc.cycle when 1 then vc.cycle_1_completed_date <> v_today or vc.cycle_1_completed_date is null
         when 2 then vc.cycle_2_completed_date <> v_today or vc.cycle_2_completed_date is null
         when 3 then vc.cycle_3_completed_date <> v_today or vc.cycle_3_completed_date is null
         else true end)
    and coalesce(vc.cycle_1_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_2_completed_date, '1900-01-01'::date) <> v_today
    and coalesce(vc.cycle_3_completed_date, '1900-01-01'::date) <> v_today
  into v_stage3_count;

  -- Promote waiting -> new_word when stage counts low (up to new_words_per_day - learning_today)
  select count(*) from public.vocabulary v where v.user_id = p_user_id and v.status = 'new_word' into v_new_word_count;
  select count(*) from public.vocabulary v where v.user_id = p_user_id and v.status = 'learning_today' into v_learning_today_count;

  if v_stage1_count <= 3 or v_stage2_count <= 3 or v_stage3_count <= 3 then
    v_to_promote := greatest(3 - least(v_stage1_count, v_stage2_count, v_stage3_count), 0);
    v_to_promote := least(v_to_promote, v_new_words_per_day - v_new_word_count - v_learning_today_count);
    v_to_promote := greatest(v_to_promote, 0);
    if v_to_promote > 0 then
      update public.vocabulary
      set status = 'new_word', cycle = 1, stage = 1, consecutive_correct = 0
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
  where v.user_id = p_user_id
    and v.status in ('new_word', 'learning_today', 'learning_before_today')
    and (
      v.status = 'new_word'
      or (
        (case v.cycle
          when 1 then v.cycle_1_completed_date is null or v.cycle_1_completed_date <> v_today
          when 2 then v.cycle_2_completed_date is null or v.cycle_2_completed_date <> v_today
          when 3 then v.cycle_3_completed_date is null or v.cycle_3_completed_date <> v_today
          else true
        end)
        and coalesce(v.cycle_1_completed_date, '1900-01-01'::date) <> v_today
        and coalesce(v.cycle_2_completed_date, '1900-01-01'::date) <> v_today
        and coalesce(v.cycle_3_completed_date, '1900-01-01'::date) <> v_today
      )
    )
  order by v.id
  limit greatest(1, coalesce((v_settings->>'new_words_per_session')::int, 50));
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.get_active_pool(uuid) to authenticated;

-- 3. submit_answer: new_word -> learning_today on first answer, set started_learning_at
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

  -- new_word -> learning_today on first answer
  if v_word.status = 'new_word' then
    update public.vocabulary
    set status = 'learning_today', started_learning_at = coalesce(started_learning_at, now())
    where id = p_word_id and user_id = p_user_id;
    v_word.status := 'learning_today';
  end if;

  select coalesce(
    (select jsonb_build_object(
      'cycle_1', cycle_1, 'cycle_2', cycle_2, 'cycle_3', cycle_3
    ) from public.user_settings where user_id = p_user_id),
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

-- 4. check_refill_needed: reservoir=50, idempotency for reservoir job, tts for waiting+new_word+learning
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
      where rj.user_id = p_user_id and rj.job_type = 'reservoir'
        and rj.status in ('pending', 'processing')
    ) then
      insert into public.refill_jobs (user_id, job_type, payload)
      values (p_user_id, 'reservoir', jsonb_build_object('count', greatest(1, v_new_words_per_day)));
    end if;
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
    and v.status in ('waiting', 'new_word', 'learning_today', 'learning_before_today')
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

-- 5. update_settings_with_trim: bounds [learning_today_count, reservoir], new_word <-> waiting
create or replace function public.update_settings_with_trim(
  p_user_id uuid,
  p_new_words_per_session smallint,
  p_new_words_per_day smallint,
  p_reservoir smallint,
  p_cycle_1 jsonb,
  p_cycle_2 jsonb,
  p_cycle_3 jsonb
)
returns jsonb as $$
declare
  v_learning_today_count int;
  v_new_word_count int;
  v_to_move int;
  v_today date := current_date;
begin
  select count(*) into v_learning_today_count
  from public.vocabulary v
  where v.user_id = p_user_id and v.status = 'learning_today';

  -- Validate: min = learning_today, max = reservoir
  if p_new_words_per_day < v_learning_today_count then
    return jsonb_build_object(
      'ok', false,
      'error', 'min_exceeded',
      'min_allowed', v_learning_today_count,
      'message', 'Cannot set below ' || v_learning_today_count || ' (words in learning today)'
    );
  end if;
  if p_new_words_per_day > p_reservoir then
    return jsonb_build_object(
      'ok', false,
      'error', 'max_exceeded',
      'max_allowed', p_reservoir,
      'message', 'Cannot set above ' || p_reservoir || ' (reservoir)'
    );
  end if;

  -- Upsert settings
  insert into public.user_settings (user_id, new_words_per_session, new_words_per_day, reservoir, cycle_1, cycle_2, cycle_3, updated_at)
  values (p_user_id, p_new_words_per_session, p_new_words_per_day, p_reservoir, p_cycle_1, p_cycle_2, p_cycle_3, now())
  on conflict (user_id) do update set
    new_words_per_session = excluded.new_words_per_session,
    new_words_per_day = excluded.new_words_per_day,
    reservoir = excluded.reservoir,
    cycle_1 = excluded.cycle_1,
    cycle_2 = excluded.cycle_2,
    cycle_3 = excluded.cycle_3,
    updated_at = excluded.updated_at;

  -- Trim excess: new_word -> waiting when reducing
  select count(*) into v_new_word_count from public.vocabulary v where v.user_id = p_user_id and v.status = 'new_word';
  v_to_move := greatest(0, v_new_word_count - (p_new_words_per_day - v_learning_today_count));
  if v_to_move > 0 then
    update public.vocabulary set status = 'waiting'
    where id in (
      select v.id from public.vocabulary v
      where v.user_id = p_user_id and v.status = 'new_word'
      order by v.id desc
      limit v_to_move
    );
  end if;

  return jsonb_build_object('ok', true, 'trimmed', v_to_move);
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.update_settings_with_trim(uuid, smallint, smallint, smallint, jsonb, jsonb, jsonb) to authenticated;
