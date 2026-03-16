# Cross-Device Sync Setup

LexiCore can sync your progress and settings across all your devices (computer, phone, tablet) using Supabase.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Create a new project
3. In **Settings → API**, copy:
   - **Project URL**
   - **anon public** key

## 2. Configure environment

Create a `.env` file in the project root (copy from `.env.example`):

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 3. Create the database table

In Supabase **SQL Editor**, run the contents of `supabase-migration.sql`:

```sql
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users can read own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on public.user_data for update
  using (auth.uid() = user_id);
```

## 4. Enable Email auth

In Supabase **Authentication → Providers**, ensure **Email** is enabled.

## 5. Use sync in the app

- Open **Settings → Account**
- Sign up with email + password (confirm email if required)
- Your progress and settings will sync to the cloud
- Sign in on another device with the same account to continue where you left off
