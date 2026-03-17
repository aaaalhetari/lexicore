-- Remove duplicate vocabulary entries (keep one per user+word)
-- Keeps the row with highest progress (cycle, stage)

delete from public.vocabulary v
using (
  select id,
    row_number() over (partition by user_id, lower(word) order by cycle desc, stage desc, id asc) as rn
  from public.vocabulary
) dup
where v.id = dup.id and dup.rn > 1;

-- Ensure unique constraint exists
drop index if exists public.vocabulary_user_word_lower_uniq;
create unique index vocabulary_user_word_lower_uniq
  on public.vocabulary (user_id, lower(word));
