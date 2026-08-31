// scripts/reclassify.js
//
// Пересчёт специальностей у всех накопленных материалов.
//
// ЗАЧЕМ. Классификатор сравнивал ключевые слова подстрокой:
// text.includes("ent") находил «ent» внутри «patient», «treatment»,
// «different»; «ear» — внутри «research», «year», «clear»; «nose» — внутри
// «diagnose». Из-за этого почти каждая научная статья получала метку ЛОР: в
// ленте под ней лежали болезнь Лайма, Medicare и формальдегид в трейлерах. На
// материал набиралось в среднем 7,4 специальности, максимум 23 — фильтр по
// специальности не фильтровал ничего.
//
// Сравнение исправлено на границы слов (modules/ai/hybridClassifier.js), и
// этот скрипт применяет исправленное правило к тому, что уже лежит в базе.
// Модель не вызывается: правила локальные, пересчёт бесплатный.
//
// Запуск:
//   node scripts/reclassify.js          — показать, что изменится
//   node scripts/reclassify.js --apply  — записать

import "dotenv/config";
import mongoose from "mongoose";
import { classifyArticle } from "../modules/ai/hybridClassifier.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL, {
    dbName: process.env.MONGO_DB || "DOCPATS_AI_NEWS",
  });
  const news = mongoose.connection.db.collection("news");

  console.log(APPLY ? "РЕЖИМ: запись" : "РЕЖИМ: пробный прогон");

  const cursor = news
    .find({})
    .project({ _id: 1, title: 1, summary: 1, specialty: 1, specialties: 1 });

  let seen = 0;
  let changed = 0;
  let labelsBefore = 0;
  let labelsAfter = 0;
  const moved = {};
  const ops = [];

  for await (const doc of cursor) {
    seen += 1;

    // Классифицируем по заголовку и аннотации. Полный текст не берём
    // намеренно: в нём много служебных слов, и по нему метки размазываются —
    // упоминание уха в разделе «методы» не делает работу оториноларингологией.
    const result = classifyArticle({
      title: doc.title || "",
      summary: doc.summary || "",
    });

    const before = Array.isArray(doc.specialties) ? doc.specialties : [];
    const after = result.specialties || [];

    labelsBefore += before.length;
    labelsAfter += after.length;

    const same =
      doc.specialty === result.specialty &&
      before.length === after.length &&
      before.every((s, i) => s === after[i]);

    if (same) continue;

    changed += 1;
    const key = `${doc.specialty || "—"} → ${result.specialty}`;
    moved[key] = (moved[key] || 0) + 1;

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            specialty: result.specialty,
            specialties: after,
            tags: result.tags || after,
          },
        },
      },
    });
  }

  console.log("");
  console.log(`материалов просмотрено: ${seen}`);
  console.log(`изменится: ${changed}`);
  console.log(
    `меток на материал: было ${(labelsBefore / seen).toFixed(1)} → станет ${(labelsAfter / seen).toFixed(1)}`,
  );

  console.log("\nСамые частые переходы:");
  const top = Object.entries(moved).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [key, n] of top) console.log(`  ${String(n).padStart(5)}  ${key}`);

  if (APPLY && ops.length > 0) {
    for (let i = 0; i < ops.length; i += 500) {
      await news.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    }
    console.log(`\nзаписано: ${ops.length}`);

    const dist = await news
      .aggregate([
        { $match: { status: "published" } },
        { $group: { _id: "$specialty", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 12 },
      ])
      .toArray();
    console.log("\nРаспределение после пересчёта:");
    for (const d of dist) console.log(`  ${String(d._id).padEnd(18)} ${d.n}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
