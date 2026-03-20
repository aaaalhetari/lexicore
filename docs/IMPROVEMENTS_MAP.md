# خريطة التحسينات المنفّذة — أين الكود؟

مرجع سريع يربط كل بند بمسارات المشروع (بدون الحاجة لتتبع المحادثة).  
المسارات من جذر مجلد التطبيق **`lexicore/`** (داخل المستودع).

## 1. واجهة المستخدم — شرح AI بعد الحفظ

| البند | الملفات |
|--------|---------|
| استيراد `refetchWord` بعد توليد الشرح | `lexicore/src/components/SessionScreen.vue` — استيراد من `store/realtime.js` |

## 2. مراقبة تكرار مهام الطابور (SQL)

| البند | الملفات |
|--------|---------|
| Views للتشخيص | `lexicore/supabase/migrations/20260320000000_card_jobs_duplicate_views.sql` |
| شرح الاستعلامات | `lexicore/docs/CARD_JOBS_DUPLICATES.md` |

## 3. منع تكرار `add_more_words` وإصلاح المهام العالقة

| البند | الملفات |
|--------|---------|
| عمود `processing_started_at`، فهرس فريد، منطق ملء الطابور (إضافة مهام الكلمات/المحتوى/الصوت)، `reset_stuck_card_jobs`، `claim_card_jobs`، `complete_card_job` / `fail_card_job`، إعادة بناء الـ view | `lexicore/supabase/migrations/20260321000000_fix_card_jobs_races_and_resets.sql` |
| المصدر الوحيد للمنطق: `check_card_jobs_needed`؛ الاسم القديم في Postgres غلاف توافق فقط | `lexicore/supabase/migrations/20260322000000_check_card_jobs_needed_canonical.sql` |

## 4. توفير TTS عند اكتمال الصوت + توافق النص مع الصوت

| البند | الملفات |
|--------|---------|
| تخطّي TTS عند اكتمال الروابط؛ إعادة استخدام الشقوق الموجودة | `lexicore/supabase/functions/add-card-sound/index.ts` |
| مسح حقول الصوت عند إعادة توليد المحتوى | `lexicore/supabase/functions/make-card-content/handlers.ts` (`handleMakeFullCard`، `handleMakeCardContentStage`) |

## 5. ثوابت أنواع المهام (مصدر واحد)

| البند | الملفات |
|--------|---------|
| القيم | `lexicore/supabase/functions/_shared/stages.ts` |
| الاستخدام | `lexicore/supabase/functions/make-card-content/*`، `lexicore/supabase/functions/run-card-jobs/index.ts` |

## 6. شرح جملة المرحلة 3

| البند | الملفات |
|--------|---------|
| استدعاء من التطبيق | `lexicore/src/store/data.js` — `explainSentence` → `explain-card-sentence` |
| منطق الحفظ + Claude | `lexicore/supabase/functions/explain-card-sentence/index.ts` |
| لا يمر عبر `make-card-content` | `make-card-content` للمحتوى/الطابور فقط |

## 7. توثيق هيكل Supabase

| البند | الملفات |
|--------|---------|
| دليل الباكند والـ migrations | `lexicore/supabase/README.md` |
| الدوال المعتمدة (خمس فقط) | `lexicore/docs/EDGE_FUNCTIONS.md` |
| رابط من دليل الإعداد | `lexicore/docs/README.md` |
| تسميات الدوال | `lexicore/docs/SERVER_NAMING.md`، `lexicore/.env.example`، `lexicore/supabase/config.toml` |

## 8. إعادة هيكلة ملفات `make-card-content`

| البند | الملفات |
|--------|---------|
| بوابة HTTP | `lexicore/supabase/functions/make-card-content/index.ts` |
| منطق DB والمسارات | `lexicore/supabase/functions/make-card-content/handlers.ts` |
| Claude prompts | `lexicore/supabase/functions/make-card-content/prompts.ts` |
| أنواع الطلب | `lexicore/supabase/functions/make-card-content/types.ts` |

---

## النشر الاعتيادي

```bash
cd lexicore
npx supabase db push
npm run deploy:functions
```

سكربت `deploy:functions` ينشر كل الدوال الحرجة بما فيها `explain-card-sentence` (انظر `package.json`).
