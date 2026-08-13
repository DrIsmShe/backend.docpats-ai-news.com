// scripts/hideJunk.js
//
// Разовая чистка накопленной ленты по тем же правилам, по которым теперь
// фильтруется загрузка (modules/ingestion/editorialFilter.js).
//
// Материалы НЕ УДАЛЯЮТСЯ: им ставится status: "archived" и excludedReason.
// Правило придумали мы, оно может оказаться неверным — по excludedReason
// видно, за что убрали, и любую группу можно вернуть одной командой:
//   db.news.updateMany({ excludedReason: "non_human" },
//                      { $set: { status: "published", excludedReason: "" } })
//
// Запуск:
//   node scripts/hideJunk.js          — только показать
//   node scripts/hideJunk.js --apply  — записать

import "dotenv/config";
import mongoose from "mongoose";
import { classifyForFeed, REASON_LABELS } from "../modules/ingestion/editorialFilter.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL, {
    dbName: process.env.MONGO_DB || "DOCPATS_AI_NEWS",
  });
  const news = mongoose.connection.db.collection("news");

  console.log(APPLY ? "РЕЖИМ: запись" : "РЕЖИМ: пробный прогон");
  console.log("");

  const cursor = news
    .find({ status: "published" })
    .project({ _id: 1, title: 1, sourceName: 1 });

  const byReason = {};
  const examples = {};
  const ops = [];

  for await (const doc of cursor) {
    const { excluded, reason } = classifyForFeed(doc);
    if (!excluded) continue;

    byReason[reason] = (byReason[reason] || 0) + 1;
    if (!examples[reason]) examples[reason] = String(doc.title).slice(0, 70);

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { status: "archived", excludedReason: reason } },
      },
    });
  }

  console.log("Будет убрано из ленты:");
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${REASON_LABELS[reason]}`);
    console.log(`        пример: ${examples[reason]}`);
  }
  console.log(`\nвсего: ${ops.length}`);

  if (APPLY && ops.length > 0) {
    for (let i = 0; i < ops.length; i += 500) {
      await news.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    }
    console.log("\nПосле правки:");
    console.log("  в ленте (published):", await news.countDocuments({ status: "published" }));
    console.log("  убрано (archived):", await news.countDocuments({ status: "archived" }));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
