# فحص التسميات والترابطات — B1 Naming Audit

## 1. refill_jobs.job_type (قاعدة البيانات)

| القيمة الحالية | الاستخدام |
|----------------|-----------|
| `add_more_words` | ✅ Migration 20240318000001، process-refill، generate-content |
| `make_card_content` | ✅ Migration، process-refill، generate-content |
| `add_card_sound` | ✅ Migration، process-refill، generate-content |

**التحقق:** القيد `refill_jobs_job_type_check` يسمح فقط بهذه القيم الثلاث. لا توجد مراجع قديمة (reservoir, stage_content, tts_content) في الكود النشط.

---

## 2. user_settings.reservoir (عمود — لم يتغير)

**ملاحظة:** `reservoir` هنا إعداد المستخدم (عدد الكلمات المستهدفة في الانتظار)، وليس نوع المهمة.

| الموقع | الاستخدام |
|--------|-----------|
| realtime.js | stats.reservoir |
| data.js | updateSettings، ensureSchema |
| HomeScreen.vue | عرض "X of Y target" |
| SettingsScreen.vue | إدخال reservoir |
| generate-content | قراءة settings.reservoir للمقارنة |

**التحقق:** العمود والـ RPC `update_settings_with_trim(p_reservoir)` يعملان بشكل صحيح.

---

## 3. Edge Functions (أسماء المجلدات/URLs)

| الدالة | المُستدعي | الحالة |
|--------|----------|--------|
| `generate-content` | data.js (makeFullCard, explainSentence)، process-refill | ✅ |
| `process-refill` | refill-cron، package.json deploy | ✅ |
| `refill-cron` | pg_cron (schedule_refill_cron)، cron-job.org | ✅ |
| `generate-all-tts-for-word` | process-refill، generate-content | ✅ |

---

## 4. Frontend → Backend

| Frontend | Backend | الحالة |
|----------|---------|--------|
| `makeFullCard()` | `generate-content` + `job_type: 'make_full_card'` | ✅ |
| `explainSentence()` | `generate-content` + `job_type: 'explain_sentence'` | ✅ |
| `updateSettings({ reservoir })` | `update_settings_with_trim(p_reservoir)` | ✅ |

---

## 5. process-refill → generate-content / generate-all-tts-for-word

| job_type من DB | الاستدعاء | الحالة |
|----------------|----------|--------|
| `add_more_words` | `generate-content` + `job_type: 'add_more_words'` | ✅ |
| `make_card_content` | `generate-content` + `job_type: 'make_card_content'` | ✅ |
| `add_card_sound` | `generate-all-tts-for-word` (مباشر) | ✅ |

---

## 6. refill-cron → check_refill_needed + process-refill

| الخطوة | الحالة |
|--------|--------|
| `supabase.rpc('check_refill_needed', { p_user_id })` | ✅ الدالة محدّثة في Migration |
| `fetch(process-refill)` | ✅ |

---

## 7. generate-content: إدراج مهام add_card_sound

عند `add_more_words` أو `make_full_card`، الدالة تُدرج مهمة صوتيات:

```ts
await supabase.from("refill_jobs").insert({
  user_id, job_type: "add_card_sound", payload: { word_id, word }
})
```

**التحقق:** ✅ يستخدم `add_card_sound` وليس `tts_content`.

---

## 8. Migrations القديمة

الـ migrations السابقة (20240316*, 20240317*) تحتوي على القيم القديمة لأنها تاريخية. Migration `20240318000001` يعيد تعريف `check_refill_needed` ويحدّث البيانات والقيد. **الترتيب صحيح.**

---

## 9. _shared/stages.ts

```ts
export const JOB_ADD_MORE_WORDS = "add_more_words"
export const JOB_MAKE_CARD_CONTENT = "make_card_content"
export const JOB_ADD_CARD_SOUND = "add_card_sound"
```

**التحقق:** الثوابت محدّثة. لا يوجد استيراد لهذه الثوابت في الكود الحالي (اختياري للاستخدام لاحقاً).

---

## 10. خلاصة

| العنصر | الحالة |
|--------|--------|
| job_type في refill_jobs | ✅ محدّث بالكامل |
| generate-content | ✅ يقبل الأسماء الجديدة |
| process-refill | ✅ يستخدم الأسماء الجديدة |
| refill-cron | ✅ يستدعي check_refill_needed المحدّثة |
| Frontend makeFullCard | ✅ |
| user_settings.reservoir | ✅ عمود منفصل، لم يتغير |
| refill_jobs (اسم الجدول) | ✅ لم يُعاد تسميته |

**لا توجد مراجع مكسورة.** التطبيق والعمليات الخلفية متسقة مع التسميات الجديدة.
