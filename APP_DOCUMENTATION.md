# LexiCore — توثيق التطبيق الكامل

## نظرة عامة

**LexiCore** هو تطبيق ويب لتدريب المفردات الإنجليزية يعتمد على:
- **Active Recall** (الاسترجاع النشط)
- **Spaced Repetition** (التكرار المتباعد)
- **3 مراحل × 3 دورات** لإتقان كل كلمة

الإصدار: **v1.0** | البناء: Vue 3 + Vite + Supabase

---

## هيكل المشروع

```
lexicore/
├── public/
├── src/
│   ├── main.js            # نقطة الدخول
│   ├── App.vue            # المكون الرئيسي + التنقل
│   ├── style.css          # المتغيرات والأنماط العامة
│   ├── lib/
│   │   └── supabase.js    # عميل Supabase
│   ├── store/
│   │   ├── data.js        # إدارة البيانات والحالة
│   │   └── sync.js        # مزامنة السحابة (Supabase)
│   ├── composables/
│   │   └── useSession.js  # منطق جلسة التدريب
│   └── components/
│       ├── HomeScreen.vue      # الشاشة الرئيسية
│       ├── SessionScreen.vue   # شاشة التدريب
│       ├── SettingsScreen.vue  # الإعدادات
│       ├── WordListScreen.vue  # قائمة الكلمات
│       └── stage/
│           ├── Stage1.vue     # اختيار التعريف
│           ├── Stage2.vue     # ملء الفراغ
│           └── Stage3.vue    # صحة/خطأ الجملة
├── .github/workflows/
│   └── deploy.yml         # نشر GitHub Pages
├── supabase/migrations/   # ترحيلات قاعدة البيانات
├── .env.example           # نموذج المتغيرات
└── package.json
```

---

## الشاشات والتنقل

| الشاشة | المسار | الوظيفة |
|--------|--------|---------|
| **Home** | `screen === 'home'` | لوحة التحكم، الإحصائيات، بدء الجلسة |
| **Session** | `screen === 'session'` | جلسة التدريب الفعلية |
| **Settings** | `screen === 'settings'` | الإعدادات، الحساب، المزامنة |
| **Word List** | `screen === 'words'` | إدارة الكلمات، استيراد/تصدير |

### الهيدر
- شعار **LexiCore v1.0**
- زر قائمة الكلمات (📚)
- زر الإعدادات (⚙️) — يختفي أثناء الجلسة

---

## نموذج البيانات

### الكلمة (Word)

```javascript
{
  id: number,
  word: string,              // الكلمة
  definition: string,        // التعريف
  example: string,           // جملة مثال (___ للفراغ)
  example_meaning: string,   // شرح الجملة
  s3_correct: string,        // جملة صحيحة للمرحلة 3
  s3_wrong: string,          // جملة خاطئة للمرحلة 3
  status: 'waiting' | 'learning' | 'mastered',
  cycle: 1 | 2 | 3,
  stage: 1 | 2 | 3,
  consecutive_correct: number,
  cycle_1_completed_date: string | null,
  cycle_2_completed_date: string | null,
  cycle_3_completed_date: string | null,
}
```

### الحالة (Status)
- **waiting**: لم تُدرج بعد في جلسة
- **learning**: قيد التعلم (دورات 1–3)
- **mastered**: أُتقنت بعد إكمال 3 دورات

### الإعدادات الافتراضية

```javascript
{
  new_words_per_session: 20,
  pool_size: 20,
  cycle_1: { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
  cycle_2: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
  cycle_3: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
}
```

---

## نظام التدريب (3 مراحل × 3 دورات)

### المراحل (Stages)

| المرحلة | النوع | الوصف |
|---------|-------|-------|
| **Stage 1** | اختيار من متعدد | عرض التعريف، اختيار الكلمة الصحيحة من 4 خيارات |
| **Stage 2** | ملء الفراغ | جملة مع فراغ، إظهار الإجابة، ثم "عرفت" أو "لم أعرف" |
| **Stage 3** | صحة/خطأ | جملة تستخدم الكلمة بشكل صحيح أو خاطئ، اختيار True/False |

### الدورات (Cycles)

- **Cycle 1** (اليوم 1): إكمال المراحل 1–3
- **Cycle 2** (اليوم 2): إعادة المراحل 1–3
- **Cycle 3** (اليوم 3): إعادة المراحل 1–3 → **mastered**

### التقدم داخل المرحلة

- كل إجابة صحيحة تزيد `consecutive_correct`
- عند الوصول إلى `stage_X_required` → الانتقال للمرحلة التالية
- إجابة خاطئة → إعادة تعيين العداد إلى 0

### اختيار الكلمة التالية (Weighted Pick)

```javascript
// الكلمات الأقل تقدماً تُعرض أكثر
weight = 1 + (1 - progress) * 3
```

---

## المكونات التفصيلية

### HomeScreen.vue
- عنوان: "Master Every Word"
- إحصائيات: Total, Learning, Mastered, Waiting, Questions Today
- بطاقتان: **Start Session** و **Word List**

### SessionScreen.vue
- **الحالات (phases)**:
  - `idle`: جاري البدء
  - `done_today`: انتهى اليوم
  - `question`: سؤال نشط
  - `mastered`: كلمة أُتقنت
  - `end`: انتهت الجلسة
- شريط التقدم، شارة الدورة/المرحلة، عداد التقدم
- زر إنهاء الجلسة (✕)
- زر تحميل JSON عند الانتهاء

### Stage1.vue
- عرض التعريف
- 4 خيارات (الكلمة الصحيحة + 3 مشتتات من `distractorPool`)
- خلط عشوائي للخيارات

### Stage2.vue
- جملة مع `___` كفراغ
- زر "Show Answer" لإظهار الكلمة
- زران: "I knew it" / "I didn't"

### Stage3.vue
- جملة صحيحة أو خاطئة (تبديل عشوائي)
- زران: True / False
- تمييز الكلمة بلون ذهبي

### SettingsScreen.vue
- **تبويبات**: General, Cycles, Account
- **General**: كلمات/جلسة، حجم المجموعة، رفع/تحميل JSON
- **Cycles**: إعدادات `stage_X_required` لكل دورة
- **Account**: تسجيل دخول GitHub، مزامنة Supabase

### WordListScreen.vue
- استيراد CSV، تصدير CSV، إضافة كلمة
- نموذج إضافة: word, definition, example, example_meaning, s3_correct, s3_wrong
- قائمة الكلمات مع الحالة (waiting / C1 S1 / mastered)

---

## التخزين والمزامنة

### localStorage
- المفتاح: `lexicore_data`
- المحتوى: `{ meta, settings, words, sessions }`

### Supabase (اختياري)
- جداول: `vocabulary`, `user_settings`, `sessions`, `refill_jobs`
- RLS: كل مستخدم يقرأ/يكتب بياناته فقط
- تسجيل الدخول: GitHub OAuth
- مزامنة فورية عبر Realtime subscriptions

### أولوية التحميل
1. إذا كان المستخدم مسجلاً → تحميل من السحابة (vocabulary, user_settings)
2. الكلمات الجديدة تُضاف عبر reservoir من `word_bank` أو يدوياً

---

## استيراد وتصدير البيانات

### JSON
- **استيراد**: استبدال كامل للبيانات
- **تصدير**: `lexicore_progress_YYYY-MM-DD.json`

### CSV
- **استيراد**: إضافة كلمات جديدة فقط (لا تكرار)
- **تصدير**: word, definition, example, example_meaning, s3_correct, s3_wrong, status, cycle, stage

---

## المتغيرات البيئية

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

بدونها: التطبيق يعمل محلياً فقط، بدون مزامنة.

---

## النشر (GitHub Pages)

- **Workflow**: `.github/workflows/deploy.yml`
- **Trigger**: push إلى `main`
- **الخطوات**: checkout → npm ci → vite build → upload artifact → deploy-pages
- **base**: `/lexicore/`
- **Secrets**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## التصميم (CSS)

### المتغيرات الرئيسية
- `--bg`, `--surface`, `--surface2`, `--surface3`, `--border`
- `--gold`, `--gold2`, `--gold-dim`
- `--green`, `--red`, `--blue` + إصدارات `-dim`
- `--text`, `--text2`, `--text3`
- `--radius`, `--radius-sm`
- `--sp`, `--tap`, `--icon`, `--fs-0`, `--fs-1`, `--fs-2`

### الخطوط
- **Fraunces**: العناوين
- **JetBrains Mono**: الأرقام والكود
- **DM Sans**: النص العام

### الخلفية
- ضوضاء خفيفة (noise texture) عبر SVG filter

---

## التبعيات

| الحزمة | الإصدار | الاستخدام |
|--------|---------|-----------|
| vue | ^3.4.0 | إطار الواجهة |
| @supabase/supabase-js | ^2.99.1 | المصادقة والمزامنة |
| vite | ^5.0.0 | البناء والتطوير |
| @vitejs/plugin-vue | ^5.0.0 | دعم Vue في Vite |

---

## سكربتات npm

```bash
npm run dev      # خادم التطوير
npm run build    # بناء الإنتاج
npm run preview  # معاينة البناء
```

---

## ملخص سير العمل

1. **البدء**: تحميل الكلمات من CSV + دمج مع التقدم المحفوظ
2. **بدء الجلسة**: `advanceCycles()` → `buildSessionPool()` → اختيار كلمة مرجحة
3. **الإجابة**: تحديث `consecutive_correct` أو إعادة تعيينه
4. **التقدم**: مرحلة → دورة → mastered
5. **الحفظ**: تحديث مباشر في `vocabulary` و `user_settings` عبر Supabase

---

*تم إنشاء هذا التوثيق تلقائياً بناءً على تحليل كود LexiCore v1.0.*
