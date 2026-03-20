# LexiCore — دليل الإعداد والتشغيل

**جذر المستودع على GitHub:** استنسخ المشروع وافتح مجلد التطبيق نفسه كجذر (حيث يوجد `package.json` و`.github/`). مجلد أعلى مثل `lexicore_vue` قد يكون فقط workspace محلي وليس المستودع الرسمي.

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
**هيكل الباكند وملاحظات SQL:** انظر [`supabase/README.md`](../supabase/README.md).  
**خريطة التحسينات الأخيرة ومسارات الملفات:** [`docs/IMPROVEMENTS_MAP.md`](IMPROVEMENTS_MAP.md).

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

## 5. جدولة التوليد

- فعّل `pg_cron` و `pg_net` من Database → Extensions ثم طبّق الـ migrations (`db push`).
- التفاصيل: [`docs/CRON_SETUP.md`](CRON_SETUP.md) · الدوال المعتمدة: [`docs/EDGE_FUNCTIONS.md`](EDGE_FUNCTIONS.md) · التسميات: [`docs/SERVER_NAMING.md`](SERVER_NAMING.md)

## 6. التشغيل المحلي

```bash
npm run dev
```

ثم http://localhost:5173/lexicore/

## 7. النشر (GitHub Pages)

- Workflow: `.github/workflows/deploy.yml`
- Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
