// scripts/refetchTruncated.js
//
// Перезабирает текст у материалов, обрезанных прежним лимитом.
//
// ЗАЧЕМ. Извлекатель резал текст на 15 000 знаках — жёстко, посреди слова. В
// лимит упёрлись 4346 материалов из 5818, и это почти целиком научные журналы:
// PLOS ONE, Frontiers, PeerJ, eLife, где статьи идут по 30-60 тысяч знаков.
// Живой пример: работа Frontiers о поражении суставов при псориатическом
// артрите — на странице 40 611 знаков, в базе лежало ровно 15 000, оборванных
// на «destructive-d». То есть у трёх четвертей ленты не хватало половины
// содержания, и это ровно та её часть, ради которой врач сюда приходит.
//
// Лимит поднят до 120 000 и режет теперь по границе абзаца
// (modules/news/news.service.js). Этот скрипт применяет исправление к тому,
// что уже лежит в базе.
//
// Материалы, у которых текст стал КОРОЧЕ прежнего, не перезаписываются: сайт
// мог поменять вёрстку, и менять полный текст на огрызок — потеря.
//
// Запуск (с сервера движка):
//   node scripts/refetchTruncated.js                 — пробный прогон, 15 штук
//   node scripts/refetchTruncated.js --apply --limit=5000
//   node scripts/refetchTruncated.js --source="PLOS ONE" --apply

import "dotenv/config";
import mongoose from "mongoose";
import { extractFullContent } from "../modules/news/news.service.js";
import { assessArticleText } from "../modules/news/textQuality.js";

const APPLY = process.argv.includes("--apply");
const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : fallback;
};
const LIMIT = Number(arg("limit", APPLY ? 500 : 15));
const SOURCE = arg("source", "");

// Граница прежнего лимита. Берём с запасом: обрезка шла ровно на 15 000, но
// хвостовые пробелы могли отъесть пару знаков.
const OLD_LIMIT = 14990;

const GAP_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL, {
    dbName: process.env.MONGO_DB || "DOCPATS_AI_NEWS",
  });
  const news = mongoose.connection.db.collection("news");

  const query = {
    status: "published",
    $expr: { $gte: [{ $strLenCP: { $ifNull: ["$content", ""] } }, OLD_LIMIT] },
  };
  if (SOURCE) query.sourceName = SOURCE;

  const total = await news.countDocuments(query);
  const docs = await news
    .find(query)
    .sort({ publishedAt: -1 })
    .limit(LIMIT)
    .project({ _id: 1, canonicalUrl: 1, sourceName: 1, title: 1, content: 1 })
    .toArray();

  console.log(APPLY ? "РЕЖИМ: запись" : "РЕЖИМ: пробный прогон");
  console.log(`обрезанных всего: ${total}, берём: ${docs.length}\n`);

  let grew = 0;
  let same = 0;
  let failed = 0;
  let addedChars = 0;

  for (const doc of docs) {
    const before = String(doc.content || "").length;

    try {
      const { content } = await extractFullContent(doc.canonicalUrl);
      const verdict = assessArticleText(content, 500);

      if (!verdict.ok) {
        failed += 1;
      } else if (verdict.text.length > before) {
        grew += 1;
        addedChars += verdict.text.length - before;
        if (APPLY) {
          await news.updateOne(
            { _id: doc._id },
            { $set: { content: verdict.text } },
          );
        }
        if (grew <= 3) {
          console.log(
            `  ${before} → ${verdict.text.length} знаков  ${String(doc.title).slice(0, 48)}`,
          );
        }
      } else {
        // Не выросло — оставляем как есть. Страница могла измениться, и
        // заменять полный текст на более короткий нельзя.
        same += 1;
      }
    } catch {
      failed += 1;
    }

    await sleep(GAP_MS);
  }

  console.log(`\nвыросло: ${grew}, без изменений: ${same}, недоступно: ${failed}`);
  if (grew > 0) {
    console.log(
      `в среднем добавлено: ${Math.round(addedChars / grew)} знаков на материал`,
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
