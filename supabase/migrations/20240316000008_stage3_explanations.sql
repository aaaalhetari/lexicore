-- Stage 3 AI explanations (why correct / why wrong) - generated with content

alter table public.vocabulary
  add column if not exists stage3_explanations_correct jsonb not null default '[]'::jsonb,
  add column if not exists stage3_explanations_incorrect jsonb not null default '[]'::jsonb;
