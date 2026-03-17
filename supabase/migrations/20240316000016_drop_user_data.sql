-- Remove user_data table (legacy sync - LexiCore v2 uses vocabulary, user_settings, sessions)
-- Policies are dropped automatically with the table
drop table if exists public.user_data;
