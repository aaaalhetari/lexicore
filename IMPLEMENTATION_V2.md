# LexiCore v2 — Implementation Guide

## Overview

LexiCore v2 transforms the app into a **100% backend-driven, real-time synchronized** learning system. All heavy logic runs in Supabase; the Vue frontend is a reactive mirror.

---

## Architecture Summary

| Layer | Responsibility |
|-------|----------------|
| **Postgres** | Schema, RLS, queue management, answer handling |
| **Edge Functions** | AI content (Claude), TTS audio (OpenAI), refill processing |
| **Realtime** | Push vocabulary changes to clients |
| **Vue** | Display, user input, lightweight reactivity |

---

## Setup Steps

### 1. Run Migrations

In Supabase **SQL Editor**, run in order:

1. `supabase/migrations/20240316000000_lexicore_v2_schema.sql`
2. `supabase/migrations/20240316000001_lexicore_functions.sql`

### 2. Enable Realtime

In Supabase **Database → Replication**, add the `vocabulary` table to the `supabase_realtime` publication.

### 3. Create Storage Bucket

In Supabase **Storage**, create a public bucket named `lexicore-audio` for TTS files.

### 4. Seed Word Bank (Optional)

The migration `20240316000017_seed_word_bank.sql` seeds `word_bank` with ~4954 words. If `word_bank` is empty, the Edge Function uses a built-in fallback list of ~50 words.

### 5. Edge Function Secrets

Set in Supabase **Settings → Edge Functions → Secrets**:

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Claude content generation |
| `OPENAI_API_KEY` | TTS audio (tts-1-hd) |

### 6. Deploy Edge Functions

```bash
supabase functions deploy generate-content
supabase functions deploy generate-audio
supabase functions deploy process-refill
```

### 7. Cron for Refill (Optional)

To process `refill_jobs` automatically, add a cron (e.g. via Supabase pg_cron or external):

- **URL**: `https://<project-ref>.supabase.co/functions/v1/process-refill`
- **Method**: POST
- **Headers**: `Authorization: Bearer <SERVICE_ROLE_KEY>`
- **Schedule**: Every 2–5 minutes

Or call `process-refill` manually when needed.

---

## Data Flow

### Reservoir Refill (30/10)

- When `waiting` count < 10, `check_refill_needed` inserts a `reservoir` job.
- `process-refill` invokes `generate-content` with `job_type: 'reservoir'`.
- `generate-content` pulls words from `word_bank`, generates AI content, inserts into `vocabulary` with `status: 'waiting'`.

### Active Pool (10/3)

- `get_active_pool` RPC:
  - Advances cycles (spaced repetition).
  - Promotes words from `waiting` to `learning` when any stage has ≤ 3 active words.
  - Returns up to 10 active words.

### Answer Submission

- Frontend calls `submit_answer(word_id, isCorrect)` RPC.
- Postgres updates the word (stage, cycle, consecutive_correct, status).
- Realtime pushes the change; Vue store updates automatically.

### Audio

- Audio is generated only for the target word (no definitions/sentences).
- `generate-audio` Edge Function uses OpenAI TTS, uploads to `lexicore-audio`, updates `audio_url`.
- UI: manual play button + auto-play 5× on reveal (Stage 1: answer selected; Stage 2: Show Answer; Stage 3: True/False).

---

## Key Files

| File | Purpose |
|------|---------|
| `src/store/realtime.js` | Realtime subscription, reactive state |
| `src/store/data.js` | RPC calls, settings, add/import |
| `src/composables/useSession.js` | Session logic, weighted pick |
| `src/composables/useAudio.js` | Play 5× on reveal |
| `supabase/functions/generate-content` | Claude content |
| `supabase/functions/generate-audio` | OpenAI TTS |
| `supabase/functions/process-refill` | Job processor |

---

## Authentication

- **Required**: Users must sign in (GitHub OAuth) to use the app.
- Without auth, the app loads with empty state.

---

## Stage Content Refill (Future)

The spec calls for stage-specific refill when content drops to ≤ 3 items. To add:

1. After consuming content (e.g. advancing stage), check remaining count.
2. If ≤ 3, insert a `stage_content` job: `{ word_id, word, stage }`.
3. `process-refill` invokes `generate-content` with `job_type: 'stage_content'`.
4. `generate-content` appends new items to the relevant JSONB array.

---

## Troubleshooting

- **No words in session**: Ensure `word_bank` is seeded or refill has run. Call `check_refill_needed` then `process-refill`.
- **Realtime not updating**: Confirm `vocabulary` is in the Realtime publication.
- **Audio missing**: Check `OPENAI_API_KEY` and `lexicore-audio` bucket. Audio is generated on demand; consider a batch job for waiting words.
