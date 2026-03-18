-- Add new_words_per_day (default 25) and reservoir threshold (default 10)
-- new_words_per_day: how many words to add from word_bank when refill runs
-- reservoir: threshold - when waiting < reservoir, trigger refill (preload for smooth flow)

alter table public.user_settings
  add column if not exists new_words_per_day smallint not null default 25,
  add column if not exists reservoir smallint not null default 10;

-- Update check_refill_needed: use reservoir for threshold, new_words_per_day for count
create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
declare
  v_waiting_count int;
  v_new_words_per_day int;
  v_reservoir int;
begin
  select coalesce(us.new_words_per_day, 25),
         coalesce(us.reservoir, 10)
  into v_new_words_per_day, v_reservoir
  from public.user_settings us
  where us.user_id = p_user_id;

  -- Fallback if no row yet
  if v_new_words_per_day is null then v_new_words_per_day := 25; end if;
  if v_reservoir is null then v_reservoir := 10; end if;

  select count(*) into v_waiting_count from public.vocabulary vc
  where vc.user_id = p_user_id and vc.status = 'waiting';

  if v_waiting_count < v_reservoir then
    insert into public.refill_jobs (user_id, job_type, payload)
    values (p_user_id, 'reservoir', jsonb_build_object('count', greatest(1, v_new_words_per_day)));
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
