-- LexiCore v2: Backend-Driven Real-Time Learning System
-- Run in Supabase SQL Editor

-- =============================================================================
-- 1. VOCABULARY TABLE (user-scoped, JSONB content)
-- =============================================================================

create table if not exists public.vocabulary (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  status text not null default 'waiting' check (status in ('waiting', 'learning', 'mastered')),
  cycle smallint not null default 1 check (cycle between 1 and 3),
  stage smallint not null default 1 check (stage between 1 and 3),
  consecutive_correct smallint not null default 0,
  cycle_1_completed_date date,
  cycle_2_completed_date date,
  cycle_3_completed_date date,
  -- Stage-specific content (JSONB for flexibility)
  stage1_definitions jsonb not null default '[]'::jsonb,  -- [{ definition, is_correct }]
  stage2_sentences jsonb not null default '[]'::jsonb,    -- [{ sentence, meaning }] sentence has ___
  stage3_correct jsonb not null default '[]'::jsonb,      -- [sentence, ...]
  stage3_incorrect jsonb not null default '[]'::jsonb,    -- [sentence, ...]
  audio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Remove duplicates before unique index (no-op if table empty)
delete from public.vocabulary v
using (
  select id,
    row_number() over (partition by user_id, lower(word) order by cycle desc, stage desc, id asc) as rn
  from public.vocabulary
) dup
where v.id = dup.id and dup.rn > 1;

drop index if exists public.vocabulary_user_word_lower_uniq;
create unique index vocabulary_user_word_lower_uniq
  on public.vocabulary (user_id, lower(word));

create index if not exists vocabulary_user_status_idx on public.vocabulary (user_id, status);
create index if not exists vocabulary_user_learning_idx on public.vocabulary (user_id, status, cycle, stage)
  where status = 'learning';
create index if not exists vocabulary_user_waiting_idx on public.vocabulary (user_id)
  where status = 'waiting';

-- =============================================================================
-- 2. USER SETTINGS
-- =============================================================================

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_words_per_session smallint not null default 20,
  pool_size smallint not null default 20,
  cycle_1 jsonb not null default '{"stage_1_required":4,"stage_2_required":4,"stage_3_required":4}'::jsonb,
  cycle_2 jsonb not null default '{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2}'::jsonb,
  cycle_3 jsonb not null default '{"stage_1_required":2,"stage_2_required":2,"stage_3_required":2}'::jsonb,
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 3. SESSIONS (for stats)
-- =============================================================================

create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  answered smallint not null default 0,
  correct smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists sessions_user_date_idx on public.sessions (user_id, date);

-- =============================================================================
-- 4. REFILL JOBS (backend queue for AI/audio generation)
-- =============================================================================

create table if not exists public.refill_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null check (job_type in ('reservoir', 'stage_content', 'audio')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists refill_jobs_pending_idx on public.refill_jobs (status)
  where status = 'pending';

-- =============================================================================
-- 5. WORD BANK (global source words for reservoir - optional)
-- =============================================================================

create table if not exists public.word_bank (
  id bigint generated always as identity primary key,
  word text not null unique,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================

alter table public.vocabulary enable row level security;
alter table public.user_settings enable row level security;
alter table public.sessions enable row level security;
alter table public.refill_jobs enable row level security;

-- vocabulary: users see only their rows
drop policy if exists "vocabulary_select_own" on public.vocabulary;
drop policy if exists "vocabulary_insert_own" on public.vocabulary;
drop policy if exists "vocabulary_update_own" on public.vocabulary;
drop policy if exists "vocabulary_delete_own" on public.vocabulary;
create policy "vocabulary_select_own" on public.vocabulary for select using (auth.uid() = user_id);
create policy "vocabulary_insert_own" on public.vocabulary for insert with check (auth.uid() = user_id);
create policy "vocabulary_update_own" on public.vocabulary for update using (auth.uid() = user_id);
create policy "vocabulary_delete_own" on public.vocabulary for delete using (auth.uid() = user_id);

-- user_settings
drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings for update using (auth.uid() = user_id);

-- sessions
drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_select_own" on public.sessions for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.sessions for insert with check (auth.uid() = user_id);
create policy "sessions_update_own" on public.sessions for update using (auth.uid() = user_id);

-- refill_jobs: service role processes; users can only see their own
drop policy if exists "refill_jobs_select_own" on public.refill_jobs;
create policy "refill_jobs_select_own" on public.refill_jobs for select using (auth.uid() = user_id);

-- word_bank: read-only for authenticated
drop policy if exists "word_bank_select" on public.word_bank;
create policy "word_bank_select" on public.word_bank for select to authenticated using (true);

-- =============================================================================
-- 7. REALTIME (enable for vocabulary)
-- Run in Supabase Dashboard: Database > Replication > add 'vocabulary' table
-- Or: alter publication supabase_realtime add table public.vocabulary;
-- =============================================================================

-- =============================================================================
-- 8. UPDATED_AT TRIGGER
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists vocabulary_updated_at on public.vocabulary;
create trigger vocabulary_updated_at
  before update on public.vocabulary
  for each row execute function public.set_updated_at();
