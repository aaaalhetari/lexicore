# إعداد Cursor للعربية واتجاه RTL

## 1. إعداد المحرر

الإعداد التالي موجود في `.vscode/settings.json` (جذر المشروع):

```json
{
  "editor.unicodeBidirectionalTextHandling": "auto"
}
```

يحسّن عرض النص العربي في **محرر الكود**.

---

## 2. إضافة Cursor RTL (نافذة المحادثة)

1. تحميل الإضافة: https://github.com/motcke/cursor-ext-rtl/releases
2. في Cursor: Extensions → `...` → **Install from VSIX...**
3. من شريط الحالة: **RTL: OFF** → **Enable RTL**
4. إعادة تشغيل Cursor

---

## ملاحظات

- قد تحتاج تشغيل Cursor كمسؤول إذا كان مثبتاً تحت `C:\Program Files`
- الإضافة تؤثر على لوحة المحادثة غالباً أكثر من المحرر

| المورد | الرابط |
|--------|--------|
| الإضافة | https://github.com/motcke/cursor-ext-rtl |
