-- RPC: update settings, validate min new_words_per_day, trim excess from waiting
-- Min = new words in learning today (can't reduce below that)
-- When reducing: delete excess words from waiting (added today)

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
  v_new_in_learning_today int;
  v_new_in_waiting_today int;
  v_to_delete int;
  v_today date := current_date;
begin
  -- Count new words in learning today (added today, now in learning)
  select count(*) into v_new_in_learning_today
  from public.vocabulary v
  where v.user_id = p_user_id and v.status = 'learning'
    and v.created_at::date = v_today;

  -- Validate: can't set below words already in learning today
  if p_new_words_per_day < v_new_in_learning_today then
    return jsonb_build_object(
      'ok', false,
      'error', 'min_exceeded',
      'min_allowed', v_new_in_learning_today,
      'message', 'Cannot set below ' || v_new_in_learning_today || ' (new words in learning today)'
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

  -- Trim excess from waiting: delete words added today from waiting until total new today <= p_new_words_per_day
  select count(*) into v_new_in_waiting_today
  from public.vocabulary v
  where v.user_id = p_user_id and v.status = 'waiting'
    and v.created_at::date = v_today;

  -- We want: v_new_in_learning_today + (v_new_in_waiting_today - deleted) <= p_new_words_per_day
  -- So: to_delete = v_new_in_waiting_today - (p_new_words_per_day - v_new_in_learning_today)
  -- to_delete = max(0, v_new_in_waiting_today + v_new_in_learning_today - p_new_words_per_day)
  v_to_delete := greatest(0, v_new_in_learning_today + v_new_in_waiting_today - p_new_words_per_day);
  v_to_delete := least(v_to_delete, v_new_in_waiting_today);

  if v_to_delete > 0 then
    delete from public.vocabulary
    where id in (
      select v.id from public.vocabulary v
      where v.user_id = p_user_id and v.status = 'waiting'
        and v.created_at::date = v_today
      order by v.id desc
      limit v_to_delete
    );
  end if;

  return jsonb_build_object('ok', true, 'trimmed', v_to_delete);
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.update_settings_with_trim(uuid, smallint, smallint, smallint, jsonb, jsonb, jsonb) to authenticated;
