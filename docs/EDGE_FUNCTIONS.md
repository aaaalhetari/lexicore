# Edge Functions المعتمدة

المشروع يعتمد **هذه الدوال الخمس فقط** (لا تُضف أسماء قديمة من لوحة قديمة إلى التوثيق أو الكود).

| المجلد | الغرض |
|--------|--------|
| `auto-add-cards` | جدولة السحب: تعبئة المهام + استدعاء `run-card-jobs` |
| `run-card-jobs` | قراءة `card_jobs` وتوجيه كل مهمة إلى المولّد المناسب |
| `make-card-content` | توليد نص المراحل (Claude): `add_more_words`, `make_card_content`, `make_full_card` |
| `add-card-sound` | TTS ورفع الصوت إلى Storage |
| `explain-card-sentence` | شرح جملة المرحلة 3؛ يستدعيها العميل مباشرة (`src/store/data.js`) |

**النشر:** `npm run deploy:functions` (انظر `package.json`).
