-- Canonical RPC: check_card_jobs_needed holds queue-fill logic.
-- check_refill_needed remains a thin compat alias (authenticated clients may still call it).

create or replace function public.check_card_jobs_needed(p_user_id uuid)
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
    perform pg_advisory_xact_lock(
      1584729031,
      hashtext('lex:add_more_words:' || p_user_id::text)
    );
    insert into public.card_jobs (user_id, job_type, payload)
    values (
      p_user_id,
      'add_more_words',
      jsonb_build_object('count', greatest(1, v_new_words_per_day))
    )
    on conflict (user_id)
      where (job_type = 'add_more_words' and status in ('pending', 'processing'))
    do nothing;
  end if;

  insert into public.card_jobs (user_id, job_type, payload)
  select v.user_id, 'add_card_sound', jsonb_build_object('word_id', v.id, 'word', v.word)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and (
      v.audio_word is null
      or coalesce(jsonb_array_length(v.audio_stage1_definitions), 0) = 0
    )
    and not exists (
      select 1 from public.card_jobs rj
      where rj.user_id = v.user_id
        and rj.job_type = 'add_card_sound'
        and (rj.payload->>'word_id')::bigint = v.id
        and rj.status in ('pending', 'processing')
    )
  limit 50;

  insert into public.card_jobs (user_id, job_type, payload)
  select v.user_id, 'make_card_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 1)
  from public.vocabulary v
  where v.user_id = p_user_id
    and coalesce(jsonb_array_length(v.stage1_definitions), 0) = 0
    and not exists (
      select 1 from public.card_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 1
        and rj.status in ('pending', 'processing')
    )
  limit 20;

  insert into public.card_jobs (user_id, job_type, payload)
  select v.user_id, 'make_card_content', jsonb_build_object('word_id', v.id, 'word', v.word, 'stage', 2)
  from public.vocabulary v
  where v.user_id = p_user_id
    and jsonb_array_length(coalesce(v.stage1_definitions, '[]'::jsonb)) > 0
    and coalesce(jsonb_array_length(v.stage2_sentences), 0) = 0
    and not exists (
      select 1 from public.card_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 2
        and rj.status in ('pending', 'processing')
    )
  limit 20;

  insert into public.card_jobs (user_id, job_type, payload)
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
      select 1 from public.card_jobs rj
      where rj.user_id = v.user_id and rj.job_type = 'make_card_content'
        and (rj.payload->>'word_id')::bigint = v.id and (rj.payload->>'stage')::int = 3
        and rj.status in ('pending', 'processing')
    )
  limit 20;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.check_refill_needed(p_user_id uuid)
returns void as $$
begin
  perform public.check_card_jobs_needed(p_user_id);
end;
$$ language plpgsql security definer set search_path = '';

grant execute on function public.check_refill_needed(uuid) to authenticated;
grant execute on function public.check_card_jobs_needed(uuid) to service_role;
