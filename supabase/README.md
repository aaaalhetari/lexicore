# LexiCore — Supabase (backend)

## Edge Functions (`functions/`)

القائمة الرسمية للمطورين: **`docs/EDGE_FUNCTIONS.md`**.

| المجلد | الغرض |
|--------|--------|
| `make-card-content/` | توليد المحتوى (Claude): `index.ts` موجّه فقط؛ `handlers.ts` منطق DB؛ `prompts.ts` نماذج Claude؛ `types.ts` جسم الطلب |
| `explain-card-sentence` | شرح جملة المرحلة 3؛ يستدعيها التطبيق مباشرة (`src/store/data.js`) |
| `add-card-sound` | TTS (OpenAI) + رفع التخزين |
| `run-card-jobs` | سحب `card_jobs` واستدعاء الدوال أعلاه |
| `auto-add-cards` | Cron: `check_card_jobs_needed` ثم تصريف الطابور |

ثوابت أنواع المهام المشتركة مع قاعدة البيانات: `functions/_shared/stages.ts`.

## Migrations (`migrations/`)

- تُطبَّق **بترتيب اسم الملف** (الطابع الزمني في البادئة).
- **السلوك الحقيقي** لأي دالة SQL مثل `check_card_jobs_needed` أو `claim_card_jobs` هو **آخر تعريف `CREATE OR REPLACE`** وصل إلى قاعدة الإنتاج (بعد `db push`)، وليس بالضرورة أول ملف يذكر الاسم.
- **`check_card_jobs_needed`** يحوي منطق ملء الطابور؛ أي اسم قديم يظل كـ **غلاف توافق** يستدعيه فقط (انظر آخر هجرة بادئة `check_card_jobs_needed_canonical`).
- قد تظهر داخل ملفات قديمة **أسماء جداول أو مسارات HTTP من مراحل سابقة**؛ ذلك **سجل تاريخي داخل SQL**. لا تُعدَّل ملفات migration بعد أن طُبّقت على الإنتاج (checksum). التطبيق الحالي للجدولة: **`auto-add-cards`** وجدول الطابور **`card_jobs`**.
- ملفات مثل `20240318000006_server_baseline_rpc.sql` مرجع مكثّف؛ أي تعديل منطقي جديد يُضاف بملف migration جديد.

## الأمان (`config.toml`)

`verify_jwt = false` على الدوال الحالية: الاعتماد على مفاتيح الخدمة للاستدعاءات الداخلية وعلى منطق الدالة + RLS للطلبات من العميل. راجع أي دالة تُفتح للعام قبل الإنتاج.
