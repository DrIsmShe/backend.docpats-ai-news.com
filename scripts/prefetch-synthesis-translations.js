/**
 * ОДНОРАЗОВЫЙ СКРИПТ — запустить один раз для перевода всех старых статей
 *
 * Запуск:
 *   node scripts/prefetch-synthesis-translations.js
 *
 * Скрипт переводит все synthesis статьи у которых нет переводов.
 * Безопасно прерывать и перезапускать — пропускает уже переведённые.
 */

import "dotenv/config";
import mongoose from "mongoose";
import Anthropic from "@anthropic-ai/sdk";

// ── Подключение к MongoDB ──────────────────────────────────────
const MONGODB_URI =
  process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

if (!MONGODB_URI) {
  console.error("❌ MONGO_URI не задан в .env");
  process.exit(1);
}

// Имя базы уже в строке подключения — dbName не указываем
await mongoose.connect(MONGODB_URI);
console.log("✅ MongoDB подключена");

// ── Inline модель ─────────────────────────────────────────────
const translationCacheSchema = new mongoose.Schema(
  {
    title: String,
    body: String,
    translatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const synthesisSchema = new mongoose.Schema(
  {
    title: String,
    body: String,
    translations: {
      type: Map,
      of: translationCacheSchema,
      default: () => new Map(),
    },
  },
  { timestamps: true },
);

const Synthesis =
  mongoose.models.Synthesis || mongoose.model("Synthesis", synthesisSchema);

// ── Claude client ─────────────────────────────────────────────
const anthropic = new Anthropic();

const LOCALE_NAMES = {
  en: "English",
  az: "Azerbaijani",
  tr: "Turkish",
  ar: "Arabic",
};

async function translateOne(title, body, locale) {
  const targetLanguage = LOCALE_NAMES[locale];

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `Translate this medical article from Russian to ${targetLanguage}.

STRICT RULES:
- Preserve ALL markdown exactly: #, ##, ###, **, *, lists, etc.
- Keep all citation references like [1], [2] unchanged
- Medical terminology must be precise
- Output ONLY the translated article, no commentary, no preamble

ARTICLE:
# ${title}

${body}`,
      },
    ],
  });

  const translated = message.content[0]?.text?.trim() || "";
  const firstLine = translated.split("\n").find((l) => l.startsWith("# "));
  const translatedTitle = firstLine ? firstLine.slice(2).trim() : title;

  return { title: translatedTitle, body: translated };
}

// ── Основной цикл ─────────────────────────────────────────────
async function run() {
  const articles = await Synthesis.find({}).sort({ createdAt: -1 });

  console.log(`\n📚 Найдено статей: ${articles.length}`);
  console.log("─".repeat(50));

  if (articles.length === 0) {
    console.log("⚠️  Статей не найдено. Проверь название коллекции в MongoDB.");
    await mongoose.disconnect();
    process.exit(0);
  }

  let totalTranslated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const num = `[${i + 1}/${articles.length}]`;

    console.log(`\n${num} "${article.title?.slice(0, 60)}..."`);

    for (const locale of Object.keys(LOCALE_NAMES)) {
      const cached = article.translations?.get(locale);

      if (cached?.title && cached?.body) {
        console.log(`  ✓ ${locale} — уже есть`);
        totalSkipped++;
        continue;
      }

      try {
        console.log(`  → ${locale} переводим...`);
        const translated = await translateOne(
          article.title,
          article.body,
          locale,
        );

        const fresh = await Synthesis.findById(article._id);
        fresh.translations.set(locale, {
          title: translated.title,
          body: translated.body,
          translatedAt: new Date(),
        });
        await fresh.save();

        console.log(`  ✅ ${locale} — "${translated.title.slice(0, 50)}..."`);
        totalTranslated++;

        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`  ❌ ${locale} — ошибка: ${err.message}`);
      }
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log(
    `✅ Готово! Переведено: ${totalTranslated} | Пропущено: ${totalSkipped}`,
  );
  console.log("─".repeat(50));

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
