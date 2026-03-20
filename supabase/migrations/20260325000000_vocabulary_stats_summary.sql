-- Server-side vocabulary stats for dashboard (full counts; client loads active rows only)

create or replace function public.vocabulary_stats_summary(p_today date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*)::int from public.vocabulary v where v.user_id = auth.uid()),
    'mastered', (select count(*)::int from public.vocabulary v where v.user_id = auth.uid() and v.status = 'mastered'),
    'waiting', (select count(*)::int from public.vocabulary v where v.user_id = auth.uid() and v.status = 'waiting'),
    'new_word', (select count(*)::int from public.vocabulary v where v.user_id = auth.uid() and v.status = 'new_word'),
    'learning_today', (select count(*)::int from public.vocabulary v where v.user_id = auth.uid() and v.status = 'learning_today'),
    'learning_before_today', (select count(*)::int from public.vocabulary v where v.user_id = auth.uid() and v.status = 'learning_before_today'),
    'eligible_today', (
      select count(*)::int from public.vocabulary v
      where v.user_id = auth.uid()
        and v.status in ('learning_today', 'learning_before_today')
        and (v.cycle_1_completed_date is null or v.cycle_1_completed_date <> p_today)
        and (v.cycle_2_completed_date is null or v.cycle_2_completed_date <> p_today)
        and (v.cycle_3_completed_date is null or v.cycle_3_completed_date <> p_today)
    ),
    'today_answered', coalesce((
      select s.answered::int from public.sessions s
      where s.user_id = auth.uid() and s.date = p_today
      limit 1
    ), 0)
  );
$$;

grant execute on function public.vocabulary_stats_summary(date) to authenticated;
