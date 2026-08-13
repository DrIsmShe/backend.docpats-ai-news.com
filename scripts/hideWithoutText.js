// scripts/hideWithoutText.js
//
// Убирает из ленты материалы, у которых нет полного текста.
//
// ЗАЧЕМ. Такая карточка обещает «читать полностью», а приводит либо к платной
// подписке (STAT+), либо к 404 (ссылки CDC протухают за месяцы). Врач тратит
// клик и упирается в стену. Пометка «только аннотация» это смягчала, но
// правильнее не показывать вовсе — на входе такие материалы теперь и не
// сохраняются (INGEST_REQUIRE_FULL_TEXT в ingestion.service.js).
//
// ЧТО ЭТО НЕ ЛОМАЕТ, и это измерено: свежий поток уже полностью с текстом. За
// последние семь дней — 347 материалов из 347, за месяц — 1521 из 1534.
// Убирается почти исключительно то, что и раньше было нечитаемым.
//
// Материалы НЕ УДАЛЯЮТСЯ: status → "archived", excludedReason → "no_full_text".
// Вернуть всё обратно:
//   db.news.updateMany({ excludedReason: "no_full_text" },
//                      { $set: { status: "published", excludedReason: "" } })
//
// Запуск:
//   node scripts/hideWithoutText.js          — показать
//   node scripts/hideWithoutText.js --apply  — записать

import "dotenv/config";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

// Тот же порог, что у загрузки и у признака hasFullText в ленте. Держать их
// разными нельзя: материал прошёл бы отбор и тут же был помечен «аннотация».
const MIN_FULL_TEXT = 500;

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL, {
    dbName: process.env.MONGO_DB || "DOCPATS_AI_NEWS",
  });
  const news = mongoose.connection.db.collection("news");

  const query = {
    status: "published",
    $expr: { $lt: [{ $strLenCP: { $ifNull: ["$content", ""] } }, MIN_FULL_TEXT] },
  };

  console.log(APPLY ? "РЕЖИМ: запись" : "РЕЖИМ: пробный прогон");

  const bySource = await news
    .aggregate([
      { $match: query },
      { $group: { _id: "$sourceName", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();

  const total = bySource.reduce((sum, s) => sum + s.n, 0);
  console.log(`\nБудет убрано ${total}:`);
  for (const s of bySource) {
    console.log(`  ${String(s._id).padEnd(24)} ${String(s.n).padStart(5)}`);
  }

  // Отдельно показываем, что уходит из свежего: если тут окажется много,
  // значит извлечение текста сломалось, и убирать ничего не надо.
  const recent = await news.countDocuments({
    ...query,
    publishedAt: { $gte: new Date(Date.now() - 7 * 864e5) },
  });
  console.log(`\nиз них за последние 7 дней: ${recent}`);
  if (recent > 50) {
    console.log(
      "  ⚠️ Это много. Похоже, сломалось извлечение текста, а не источники —" +
        " проверьте, прежде чем применять.",
    );
  }

  if (APPLY) {
    const res = await news.updateMany(query, {
      $set: { status: "archived", excludedReason: "no_full_text" },
    });
    console.log(`\nубрано: ${res.modifiedCount}`);

    const feed = { status: "published", isDuplicate: false };
    const left = await news.countDocuments(feed);
    const withText = await news.countDocuments({
      ...feed,
      $expr: { $gte: [{ $strLenCP: { $ifNull: ["$content", ""] } }, MIN_FULL_TEXT] },
    });
    console.log(`в ленте осталось: ${left}, из них с полным текстом: ${withText}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
