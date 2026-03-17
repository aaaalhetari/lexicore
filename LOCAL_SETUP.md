# تشغيل LexiCore محلياً

## لماذا النسخة المحلية لا تعمل؟

الجلسة (Session) لا تُنقل بين النطاقات. على **GitHub Pages** أنت مسجّل الدخول، لكن على **localhost** تحتاج لتسجيل الدخول من جديد.

## الخطوات

### 1. إضافة localhost إلى Supabase

1. افتح [Supabase Auth → Redirect URLs](https://supabase.com/dashboard/project/ryknnazacqzmasolhtkc/auth/url-configuration)
2. في **Redirect URLs** أضف:
   ```
   http://localhost:5173/lexicore/
   ```
3. اضغط **Save**

### 2. تسجيل الدخول من التطبيق المحلي

1. شغّل التطبيق: `npm run dev`
2. افتح: http://localhost:5173/lexicore/
3. اضغط ⚙️ (Settings) → Account → **Sign in with GitHub**
4. بعد تسجيل الدخول، جرّب "Generate words from cloud"

---

## تشغيل التطبيق

```bash
cd lexicore
npm run dev
```

ثم افتح: http://localhost:5173/lexicore/
