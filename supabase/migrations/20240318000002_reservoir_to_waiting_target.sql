-- B1-friendly: user_settings.reservoir → waiting_target

-- 1. Rename column
alter table public.user_settings rename column reservoir to waiting_target;

-- 2. Update ensure_user_settings_columns
create or replace function public.ensure_user_settings_columns()
returns void as $$
begin
  alter table public.user_settings
    add column if not exists new_words_per_day smallint not null default 25,
    add column if not exists waiting_target smallint not null default 50;
  alter table public.user_settings alter column waiting_target set default 50;
exception when others then
  null;
end;
$$ language plpgsql security definer set search_path = '';

-- 3. Update update_settings_with_trim (drop + recreate to change param name)
drop function if exists public.update_settings_with_trim(uuid, smallint, smallint, smallint, jsonb, jsonb, jsonb);
create or replace function public.update_settings_with_trim(
  p_user_id uuid,
  p_new_words_per_session smallint,
  p_new_words_per_day smallint,
  p_waiting_target smallint,
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

  if p_new_words_per_day < v_learning_today_count then
    return jsonb_build_object(
      'ok', false,
      'error', 'min_exceeded',
      'min_allowed', v_learning_today_count,
      'message', 'Cannot set below ' || v_learning_today_count || ' (words in learning today)'
    );
  end if;
  if p_new_words_per_day > p_waiting_target then
    return jsonb_build_object(
      'ok', false,
      'error', 'max_exceeded',
      'max_allowed', p_waiting_target,
      'message', 'Cannot set above ' || p_waiting_target || ' (waiting target)'
    );
  end if;

  insert into public.user_settings (user_id, new_words_per_session, new_words_per_day, waiting_target, cycle_1, cycle_2, cycle_3, updated_at)
  values (p_user_id, p_new_words_per_session, p_new_words_per_day, p_waiting_target, p_cycle_1, p_cycle_2, p_cycle_3, now())
  on conflict (user_id) do update set
    new_words_per_session = excluded.new_words_per_session,
    new_words_per_day = excluded.new_words_per_day,
    waiting_target = excluded.waiting_target,
    cycle_1 = excluded.cycle_1,
    cycle_2 = excluded.cycle_2,
    cycle_3 = excluded.cycle_3,
    updated_at = excluded.updated_at;

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

-- 4. Update get_active_pool to use waiting_target
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
  v_waiting_target int;
begin
  perform public.advance_cycles(p_user_id);

  select coalesce(
    (select jsonb_build_object(
      'cycle_1', us.cycle_1, 'cycle_2', us.cycle_2, 'cycle_3', us.cycle_3,
      'new_words_per_session', us.new_words_per_session,
      'new_words_per_day', us.new_words_per_day, 'waiting_target', us.waiting_target
    ) from public.user_settings us where us.user_id = p_user_id),
    '{"cycle_1":{"stage_1_required":4,"stage_2_required":4,"stage_3_required":4},
      "cycle_2":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "cycle_3":{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2},
      "new_words_per_session":50,"new_words_per_day":25,"waiting_target":50}'::jsonb
  ) into v_settings;

  v_new_words_per_day := coalesce((v_settings->>'new_words_per_day')::int, 25);
  v_waiting_target := coalesce((v_settings->>'waiting_target')::int, 50);

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

-- 5. Update daily_reset and assign_daily_quota to use waiting_target
create or replace function public.daily_reset(p_run_date date default current_date)
returns void as $$
declare
  r record;
  v_learning_today_count int;
  v_to_assign int;
  v_waiting_target int;
  v_new_words_per_day int;
begin
  update public.vocabulary
  set status = 'learning_before_today'
  where status = 'learning_today'
    and (started_learning_at::date < p_run_date or started_learning_at is null);

  for r in select user_id from public.user_settings
  loop
    select coalesce(us.waiting_target, 50), coalesce(us.new_words_per_day, 25)
    into v_waiting_target, v_new_words_per_day
    from public.user_settings us where us.user_id = r.user_id;

    update public.vocabulary set status = 'waiting' where user_id = r.user_id and status = 'new_word';

    select count(*) into v_learning_today_count from public.vocabulary v
    where v.user_id = r.user_id and v.status = 'learning_today';
    v_to_assign := greatest(0, least(v_new_words_per_day - v_learning_today_count, v_waiting_target));

    if v_to_assign > 0 then
      update public.vocabulary
      set status = 'new_word'
      where id in (
        select v.id from public.vocabulary v
        where v.user_id = r.user_id and v.status = 'waiting'
        order by v.id
        limit v_to_assign
      );
    end if;
  end loop;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.assign_daily_quota(p_user_id uuid)
returns void as $$
declare
  v_new_word_count int;
  v_learning_today_count int;
  v_to_assign int;
  v_waiting_target int;
  v_new_words_per_day int;
begin
  select coalesce(us.waiting_target, 50), coalesce(us.new_words_per_day, 25)
  into v_waiting_target, v_new_words_per_day
  from public.user_settings us where us.user_id = p_user_id;

  if v_new_words_per_day is null then v_new_words_per_day := 25; end if;
  if v_waiting_target is null then v_waiting_target := 50; end if;

  select count(*) into v_new_word_count from public.vocabulary v where v.user_id = p_user_id and v.status = 'new_word';
  select count(*) into v_learning_today_count from public.vocabulary v where v.user_id = p_user_id and v.status = 'learning_today';

  v_to_assign := greatest(0, least(v_new_words_per_day - v_new_word_count - v_learning_today_count, v_waiting_target));

  if v_to_assign > 0 then
    update public.vocabulary
    set status = 'new_word'
    where id in (
      select v.id from public.vocabulary v
      where v.user_id = p_user_id and v.status = 'waiting'
      order by v.id
      limit v_to_assign
    );
  end if;
end;
$$ language plpgsql security definer set search_path = '';

-- 5. Update check_refill_needed to use waiting_target
create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
declare
  v_waiting_count int;
  v_new_words_per_day int;
  v_waiting_target int;
begin
  select coalesce(us.new_words_per_day, 25), coalesce(us.waiting_target, 50)
  into v_new_words_per_day, v_waiting_target
  from public.user_settings us where us.user_id = p_user_id;

  if v_new_words_per_day is null then v_new_words_per_day := 25; end if;
  if v_waiting_target is null then v_waiting_target := 50; end if;

  select count(*) into v_waiting_count from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'waiting';

  if v_waiting_count < v_waiting_target then
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
