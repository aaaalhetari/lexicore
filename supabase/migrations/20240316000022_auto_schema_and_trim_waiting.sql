-- 1. Ensure user_settings has new_words_per_day and reservoir (idempotent, safe to run on init)
create or replace function public.ensure_user_settings_columns()
returns void as $$
begin
  alter table public.user_settings
    add column if not exists new_words_per_day smallint not null default 25,
    add column if not exists reservoir smallint not null default 10;
exception when others then
  null; -- ignore if columns already exist
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.ensure_user_settings_columns() to authenticated;
grant execute on function public.ensure_user_settings_columns() to anon;

-- 2. Trim waiting words to limit: keep oldest p_limit by id, delete the rest
create or replace function public.trim_waiting_to_limit(p_user_id uuid, p_limit int)
returns int as $$
declare
  v_deleted int;
begin
  with to_delete as (
    select id from public.vocabulary v
    where v.user_id = p_user_id and v.status = 'waiting'
    order by id asc
    offset greatest(0, p_limit)
  )
  delete from public.vocabulary
  where id in (select id from to_delete);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.trim_waiting_to_limit(uuid, int) to authenticated;
