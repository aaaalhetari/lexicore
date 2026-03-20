# تسميات السيرفر — مراحل التطبيق

## مراحل البطاقة (Card Stages)

| Stage | الاسم | المحتوى |
|-------|-------|---------|
| 1 | Definition | 5 تعريفات اختيار من متعدد (واحد صحيح) |
| 2 | Gap-fill | 5 جمل لملء الفراغ (___) |
| 3 | Usage judgment | 5 جمل صحيحة + 5 خاطئة |

## أنواع المهام (`card_jobs.job_type`)

| القيمة | المعنى | المرحلة |
|--------|--------|---------|
| `add_more_words` | توسيع مخزون الانتظار (كلمات جديدة) | قبل المراحل |
| `make_card_content` | محتوى مرحلة البطاقة (1 أو 2 أو 3) | Stage 1, 2, 3 |
| `add_card_sound` | صوتيات البطاقة (كلمة + كل المراحل) | كل المراحل |

## Edge Functions

| الدالة | الدور |
|--------|-------|
| `make-card-content` | `make_full_card`، `make_card_content`، `add_more_words` |
| `explain-card-sentence` | شرح جملة المرحلة 3 (Claude + حفظ في vocabulary) — يستدعيها العميل مباشرة |
| `run-card-jobs` | معالجة مهام التوليد (queue) |
| `auto-add-cards` | جدولة التوليد التلقائي (كل ساعة) |
| `add-card-sound` | صوتيات البطاقة (batch only) |
