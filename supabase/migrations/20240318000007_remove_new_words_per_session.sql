-- Remove legacy per-session cap setting.
-- Keeps daily flow controlled by new_words_per_day + waiting_target only.

alter table public.user_settings
drop column if exists new_words_per_session;

drop function if exists public.update_settings_with_trim(uuid, smallint, smallint, smallint, jsonb, jsonb, jsonb);
drop function if exists public.update_settings_with_trim(uuid, smallint, smallint, jsonb, jsonb, jsonb);

create or replace function public.update_settings_with_trim(
  p_user_id uuid,
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

  insert into public.user_settings (user_id, new_words_per_day, waiting_target, cycle_1, cycle_2, cycle_3, updated_at)
  values (p_user_id, p_new_words_per_day, p_waiting_target, p_cycle_1, p_cycle_2, p_cycle_3, now())
  on conflict (user_id) do update set
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

grant execute on function public.update_settings_with_trim(uuid, smallint, smallint, jsonb, jsonb, jsonb) to authenticated;

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
  v_stage1_count int;
  v_stage2_count int;
  v_stage3_count int;
  v_new_word_count int;
  v_learning_today_count int;
  v_to_promote int;
  v_new_words_per_day int;
begin
  perform public.advance_cycles(p_user_id);

  select coalesce(
    (select us.new_words_per_day from public.user_settings us where us.user_id = p_user_id),
    25
  ) into v_new_words_per_day;

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
  order by v.id;
end;
$$ language plpgsql security definer set search_path = '';
