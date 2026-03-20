# مراقبة تكرار `card_jobs`

الطابور يُدار عبر **`run-card-jobs`** و **`auto-add-cards`** (انظر `docs/EDGE_FUNCTIONS.md`).

بعد تطبيق migration `20260320000000_card_jobs_duplicate_views.sql` تتوفر ثلاث views لقراءة التكرار من SQL Editor أو أي عميل متصل بـ Postgres.

**إصلاح منع التكرار (مهام `add_more_words` + إعادة المهام العالقة):** طبّق migration `20260321000000_fix_card_jobs_races_and_resets.sql` — يضيف فهرسًا فريدًا جزئيًا، قفلًا معاملاتيًا عند الإدراج، ويحدّ `reset_stuck_card_jobs` بحيث لا يعيد كل `processing` إلى `pending` في كل تشغيل (فقط المهام عالقة أكثر من ~45 دقيقة).

## 1) `v_card_jobs_active_duplicates`

صفوف **pending / processing** تنتمي لمجموعة فيها **أكثر من صف** لنفس:

- `add_more_words`: نفس المستخدم (أي أكثر من مهمة إضافة كلمات نشطة).
- `add_card_sound`: نفس المستخدم ونفس `payload.word_id`.
- `make_card_content`: نفس المستخدم ونفس `word_id` ونفس `stage`.

الأعمدة المهمة: `duplicate_group_size` (عدد الصفوف في المجموعة)، `id`، `created_at` لترتيب الأقدم/الأحدث.

```sql
select * from public.v_card_jobs_active_duplicates
order by duplicate_group_size desc, user_id, dedupe_key;
```

## 2) `v_card_jobs_history_sound_multi_done`

لكل `(user_id, word_id)` عدد مرات اكتمال (`done`) مهمة **add_card_sound** أكثر من مرة — يشير عادة إلى تشغيل TTS كامل متكرر لنفس البطاقة.

```sql
select * from public.v_card_jobs_history_sound_multi_done
order by done_runs desc;
```

## 3) `v_card_jobs_history_content_multi_done`

نفس الفكرة لـ **make_card_content**: نفس `word_id` و`stage` اكتملتا (`done`) أكثر من مرة.

```sql
select * from public.v_card_jobs_history_content_multi_done
order by done_runs desc;
```

## صلاحيات

- **المستخدم في التطبيق**: يسري RLS على `card_jobs`؛ يرى المستخدم صفوفه فقط.
- **لوحة Supabase / `service_role`**: رؤية كل المستخدمين.

## تطبيق الـ migration محليًا

```bash
cd lexicore && npx supabase db push
```

أو نفّذ محتوى الملف يدويًا في SQL Editor على المشروع البعيد.
