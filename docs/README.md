# LexiCore — دليل الإعداد والتشغيل

## 1. المتغيرات البيئية

انسخ `.env.example` إلى `.env` واملأ:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 2. Supabase

### إنشاء المشروع
1. [supabase.com](https://supabase.com) → إنشاء مشروع
2. **Settings → API** → انسخ Project URL و anon key

### Migrations
```bash
npx supabase db push
```

أو نفّذ الملفات في `supabase/migrations/` بالترتيب من SQL Editor.

### Realtime
**Database → Replication** → أضف جدول `vocabulary` إلى `supabase_realtime`.

### Storage
أنشئ bucket عام باسم `lexicore-audio`.

## 3. Edge Functions

### Secrets (Settings → Edge Functions → Secrets)
| Secret | الغرض |
|--------|-------|
| ANTHROPIC_API_KEY | Claude (المحتوى) |
| OPENAI_API_KEY | TTS (الصوت) |

### النشر
```bash
npm run deploy:functions
```

## 4. المزامنة (GitHub OAuth)

1. **GitHub** → Developer Settings → OAuth Apps → New
2. **Supabase** → Authentication → Providers → GitHub (تفعيل + Client ID/Secret)
3. **Redirect URLs**: أضف `http://localhost:5173/lexicore/` و URL الإنتاج

## 5. جدولة Refill

- فعّل `pg_cron` و `pg_net` من Database → Extensions
- الجدولة تتم عبر migration `20240317000004` عند `db push`
- daily_reset: نفّذ `supabase/scripts/schedule-daily-reset.sql` يدوياً

## 6. التشغيل المحلي

```bash
npm run dev
```

ثم http://localhost:5173/lexicore/

## 7. النشر (GitHub Pages)

- Workflow: `.github/workflows/deploy.yml`
- Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
