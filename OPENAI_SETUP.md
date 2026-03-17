# إعداد OpenAI API للصوت (TTS)

## المشكلة: Total tokens = 0

إذا ظهرت استخدامات OpenAI صفراً، فهذا يعني أن المفتاح غير مضبوط أو غير صحيح في Supabase.

## الخطوات

### 1. إضافة المفتاح في Supabase

1. افتح Supabase Dashboard → مشروعك → **Project Settings** → **Edge Functions** → **Secrets**
2. اذهب إلى **Project Settings** → **Edge Functions** → **Secrets**
3. أضف أو حدّث:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** مفتاحك من [OpenAI API Keys](https://platform.openai.com/api-keys)

### 2. التحقق من المفتاح

- المفتاح يبدأ بـ `sk-` أو `sk-proj-`
- تأكد من وجود رصيد في حساب OpenAI
- المفتاح يجب أن يكون من نفس الحساب الذي تتحقق منه في Usage

### 3. ملاحظة عن Usage

- **TTS (Text-to-Speech)** يُحتسب بعدد الحروف، وليس بالـ tokens
- قد يظهر في قسم "Audio" أو "Speech" في صفحة Usage، وليس في "Total tokens"

## اختبار

بعد إضافة المفتاح، اضغط على "Generate audio for words without sound" في Settings → Account. إذا ظهر خطأ، ستظهر رسالة توضح السبب.
