# ترحيل صوتيات الكلمات (Migration)

## الهدف

توحيد الملفات الصوتية في المسار الجديد:

| قديم | جديد |
|------|------|
| `all-lexicore-audio/{userId}/{wordId}-{word}/` | `all-lexicore-audio/{word}/` |
| `all-lexicore-audio/{userId}/{word}/` | `all-lexicore-audio/{word}/` |
| `all-lexicore-audio/tts/` و `{userId}/tts/` | حذف (لا يمكن ربطها بالكلمات) |

مثال: `3ef58768.../12345-advice/` → `advice/`

## التشغيل

### 1. نشر الدالة

```bash
npm run deploy:functions
```

أو نشر الدالة فقط:

```bash
npx supabase functions deploy migrate-audio-structure
```

### 2. استدعاء الترحيل

من Supabase Dashboard → Edge Functions → `migrate-audio-structure` → Invoke

أو عبر curl:

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/migrate-audio-structure" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{}'
```

### 3. النتيجة

- `migrated`: عدد الملفات المنقولة
- `vocabulary_updated`: عدد صفوف vocabulary المحدّثة

## ملاحظات

- يُنفَّذ مرة واحدة (أو عند إضافة كلمات قديمة)
- الملفات تُنقل (move) وليست نسخاً — المسار القديم يُحذف
- جدول `vocabulary` يُحدَّث بروابط الملفات الجديدة
