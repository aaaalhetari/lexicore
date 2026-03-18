-- LexiCore: 5-status system
-- waiting (buffer, default 50), new_word (to study), learning_today, learning_before_today, mastered
-- reservoir default 50, new_words_per_day bounded by [learning_today_count, reservoir]

-- 1. Drop old constraint, migrate data, add new constraint
alter table public.vocabulary drop constraint if exists vocabulary_status_check;
update public.vocabulary set status = 'learning_before_today' where status = 'learning';
alter table public.vocabulary add constraint vocabulary_status_check
  check (status in ('waiting', 'new_word', 'learning_today', 'learning_before_today', 'mastered'));

-- 3. Add started_learning_at (when word entered learning) - for stats
alter table public.vocabulary add column if not exists started_learning_at timestamptz;
update public.vocabulary
set started_learning_at = coalesce(cycle_1_completed_date::timestamptz, created_at)
where status = 'learning_before_today' and started_learning_at is null;

-- 4. user_settings: reservoir default 50
alter table public.user_settings alter column reservoir set default 50;
update public.user_settings set reservoir = 50 where reservoir < 50;

-- 5. daily_reset: learning_today -> learning_before_today, new_word -> waiting, waiting -> new_word
create or replace function public.daily_reset(p_run_date date default current_date)
returns void as $$
declare
  r record;
  v_learning_today_count int;
  v_to_assign int;
  v_reservoir int;
  v_new_words_per_day int;
begin
  -- learning_today -> learning_before_today (words that started learning before p_run_date)
  update public.vocabulary
  set status = 'learning_before_today'
  where status = 'learning_today'
    and (started_learning_at::date < p_run_date or started_learning_at is null);

  for r in select user_id from public.user_settings
  loop
    select coalesce(us.reservoir, 50), coalesce(us.new_words_per_day, 25)
    into v_reservoir, v_new_words_per_day
    from public.user_settings us where us.user_id = r.user_id;

    -- new_word (unstudied) -> waiting
    update public.vocabulary set status = 'waiting' where user_id = r.user_id and status = 'new_word';

    -- Assign daily quota: waiting -> new_word (up to new_words_per_day)
    select count(*) into v_learning_today_count from public.vocabulary v
    where v.user_id = r.user_id and v.status = 'learning_today';
    v_to_assign := greatest(0, least(v_new_words_per_day - v_learning_today_count, v_reservoir));

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

-- 6. assign_daily_quota: call on app init - ensures user has new_word assigned for today
create or replace function public.assign_daily_quota(p_user_id uuid)
returns void as $$
declare
  v_new_word_count int;
  v_learning_today_count int;
  v_to_assign int;
  v_reservoir int;
  v_new_words_per_day int;
begin
  select coalesce(us.reservoir, 50), coalesce(us.new_words_per_day, 25)
  into v_reservoir, v_new_words_per_day
  from public.user_settings us where us.user_id = p_user_id;

  if v_new_words_per_day is null then v_new_words_per_day := 25; end if;
  if v_reservoir is null then v_reservoir := 50; end if;

  select count(*) into v_new_word_count from public.vocabulary v where v.user_id = p_user_id and v.status = 'new_word';
  select count(*) into v_learning_today_count from public.vocabulary v where v.user_id = p_user_id and v.status = 'learning_today';

  v_to_assign := greatest(0, least(v_new_words_per_day - v_new_word_count - v_learning_today_count, v_reservoir));

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

grant execute on function public.daily_reset(date) to service_role;
grant execute on function public.assign_daily_quota(uuid) to authenticated;

-- 7. Update ensure_user_settings_columns: reservoir default 50
create or replace function public.ensure_user_settings_columns()
returns void as $$
begin
  alter table public.user_settings
    add column if not exists new_words_per_day smallint not null default 25,
    add column if not exists reservoir smallint not null default 50;
  alter table public.user_settings alter column reservoir set default 50;
exception when others then
  null;
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.ensure_user_settings_columns() to authenticated;
grant execute on function public.ensure_user_settings_columns() to anon;
