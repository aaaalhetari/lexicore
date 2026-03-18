# أين تحذف الأشياء من Supabase يدوياً

إذا أردت حذف Edge Functions أو أي عناصر أخرى من Supabase Dashboard يدوياً:

---

## 1. Edge Functions (الدوال)

**المسار:**
```
https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/functions
```

**الخطوات:**
1. اذهب إلى [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك (LexiCore)
3. من القائمة الجانبية: **Edge Functions**
4. ستظهر قائمة بجميع الدوال
5. اضغط على الدالة → **⋮** (ثلاث نقاط) → **Delete**

---

## 2. Storage (التخزين)

**المسار:**
```
https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/storage/buckets
```

**الخطوات:**
1. من القائمة الجانبية: **Storage**
2. اختر الـ bucket (مثل `lexicore-audio`)
3. تصفح المجلدات واحذف الملفات/المجلدات غير المرغوبة

---

## 3. Database (قاعدة البيانات)

**المسار:**
```
https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/editor
```

**الخطوات:**
1. من القائمة الجانبية: **Table Editor** أو **SQL Editor**
2. **Table Editor**: احذف الصفوف من الجداول
3. **SQL Editor**: نفّذ استعلامات `DELETE` أو `DROP` حسب الحاجة

---

## 4. Cron Jobs (pg_cron)

**المسار:**
```
https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/database/cron-jobs
```

**الخطوات:**
1. من القائمة الجانبية: **Database** → **Cron Jobs**
2. أو استخدم **SQL Editor** وتنفيذ:
   ```sql
   SELECT cron.unschedule('job-name');
   ```

---

## روابط سريعة لمشروعك

| العنصر | الرابط |
|--------|--------|
| Edge Functions | https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/functions |
| Storage | https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/storage/buckets |
| Table Editor | https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/editor |
| SQL Editor | https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/sql/new |
| Settings → API | https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/settings/api |

---

**ملاحظة:** استبدل `ryknnazacqzmasolhtkc` بمعرف مشروعك إذا كان مختلفاً.
