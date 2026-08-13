// scripts/hidePaywalled.js
//
// Убирает из ленты материалы, оборванные платной стеной.
//
// ЗАЧЕМ. Проверка «текста больше 500 знаков» их не ловила. Разбор живого
// материала STAT на 1773 знака показал, из чего он состоит:
//
//   биография автора (390 знаков)
//   вводный абзац статьи (750 знаков)   ← всё, что нам досталось
//   «To read the rest of this story subscribe to STAT+»
//   снова биография и форма подписки (540 знаков)
//
// То есть три четверти «статьи» — служебные блоки, а сам материал оборван на
// первом абзаце. Длина при этом набирается, и карточка показывалась как полная
// статья. Именно на такую наткнулся автор проекта, открыв ленту.
//
// Признак — призыв дочитать по подписке в самом тексте, а не слово
// «subscribe»: последнее есть в подвале и у совершенно открытых статей.
// Правила живут в modules/news/textQuality.js, общие с загрузкой.
//
// Материалы не удаляются: status → "archived", excludedReason → "paywalled".
// Вернуть:
//   db.news.updateMany({ excludedReason: "paywalled" },
//                      { $set: { status: "published", excludedReason: "" } })
//
// Запуск:
//   node scripts/hidePaywalled.js          — показать
//   node scripts/hidePaywalled.js --apply  — записать

import "dotenv/config";
import mongoose from "mongoose";
import { isTruncated } from "../modules/news/textQuality.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL, {
    dbName: process.env.MONGO_DB || "DOCPATS_AI_NEWS",
  });
  const news = mongoose.connection.db.collection("news");

  console.log(APPLY ? "РЕЖИМ: запись" : "РЕЖИМ: пробный прогон");

  const cursor = news
    .find({ status: "published" })
    .project({ _id: 1, title: 1, sourceName: 1, content: 1 });

  const bySource = {};
  const ops = [];
  let example = null;

  for await (const doc of cursor) {
    if (!isTruncated(doc.content)) continue;

    const src = doc.sourceName || "—";
    bySource[src] = (bySource[src] || 0) + 1;
    if (!example) example = String(doc.title).slice(0, 62);

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { status: "archived", excludedReason: "paywalled" } },
      },
    });
  }

  console.log(`\nОборвано платной стеной: ${ops.length}`);
  for (const [src, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src.padEnd(22)} ${n}`);
  }
  if (example) console.log(`  пример: ${example}`);

  if (APPLY && ops.length > 0) {
    for (let i = 0; i < ops.length; i += 500) {
      await news.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    }
    const feed = { status: "published", isDuplicate: false };
    console.log(`\nубрано: ${ops.length}`);
    console.log("в ленте осталось:", await news.countDocuments(feed));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
