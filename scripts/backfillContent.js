// scripts/backfillContent.js
//
// Добор полного текста для материалов, у которых его нет.
//
// ЗАЧЕМ. Треть ленты лежала без текста: карточка обещала «читать полностью», а
// уводила к издателю. Причина оказалась не в источниках, а в нашем запросе —
// извлекатель представлялся поддельным Googlebot, и CDC отклонял его с 403
// (подделка под поисковик запрещена их правилами). С честной подписью тот же
// адрес отдаёт около 4700 знаков.
//
// ЧТО ЭТОТ СКРИПТ НЕ ЧИНИТ, и это проверено, а не предположено:
//   STAT News — контент платный (STAT+). Отдаётся 500-600 знаков анонса, и это
//               законный предел, а не наша проблема.
//   FDA       — отклоняет запросы именно с нашего сервера (с других адресов
//               отвечает). Просить настойчивее нельзя.
// Такие материалы остаются с пометкой «только аннотация» — честно.
//
// Запуск (только с сервера движка — оттуда идут сетевые запросы):
//   node scripts/backfillContent.js               — пробный прогон, 20 штук
//   node scripts/backfillContent.js --apply       — записать
//   node scripts/backfillContent.js --apply --limit=2000
//   node scripts/backfillContent.js --source="CDC Newsroom"

import "dotenv/config";
import mongoose from "mongoose";
import { extractFullContent } from "../modules/news/news.service.js";

const APPLY = process.argv.includes("--apply");
const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : fallback;
};
const LIMIT = Number(arg("limit", APPLY ? 500 : 20));
const SOURCE = arg("source", "");

// Ниже этого текст — не статья, а подпись под ссылкой. Тот же порог, по
// которому лента считает hasFullText.
const MIN_LEN = 500;

// Источники, у которых добор ЗАПРЕЩЁН, и почему.
//
// STAT News отдаёт страницу целиком, но тело платных материалов (STAT+) в неё
// не входит — извлекатель хватает боковые блоки, и текст начинается с
// биографии автора: «Anil Oza is a general assignment reporter at STAT…».
// Длина при этом набирается в полторы-шесть тысяч знаков и проходит порог.
// То есть без этого запрета мы записали бы мусор и пометили его «полный
// текст» — ровно тот обман, ради устранения которого признак и заводился.
const SKIP_SOURCES = new Set(["STAT News"]);

// Пауза между обращениями: мы ходим к чужим сайтам пачкой, и делать это
// быстрее, чем читает человек, — невежливо и ведёт к блокировке адреса.
const GAP_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL, {
    dbName: process.env.MONGO_DB || "DOCPATS_AI_NEWS",
  });
  const news = mongoose.connection.db.collection("news");

  const query = {
    status: "published",
    $expr: { $lt: [{ $strLenCP: { $ifNull: ["$content", ""] } }, MIN_LEN] },
  };
  if (SOURCE) query.sourceName = SOURCE;

  const total = await news.countDocuments(query);
  const docs = await news
    .find(query)
    .sort({ publishedAt: -1 })
    .limit(LIMIT)
    .project({ _id: 1, canonicalUrl: 1, sourceName: 1, title: 1 })
    .toArray();

  console.log(APPLY ? "РЕЖИМ: запись" : "РЕЖИМ: пробный прогон");
  console.log(`без текста всего: ${total}, берём: ${docs.length}\n`);

  const stat = {};
  let filled = 0;

  for (const doc of docs) {
    const src = doc.sourceName || "—";
    stat[src] ||= { ok: 0, short: 0, fail: 0, skipped: 0 };

    if (SKIP_SOURCES.has(src)) {
      stat[src].skipped += 1;
      continue;
    }

    try {
      const { content } = await extractFullContent(doc.canonicalUrl);
      const text = String(content || "").trim();

      if (text.length >= MIN_LEN) {
        stat[src].ok += 1;
        filled += 1;
        if (APPLY) {
          await news.updateOne({ _id: doc._id }, { $set: { content: text } });
        }
      } else {
        // Дошли, но текста нет: платный доступ или страница-заглушка.
        stat[src].short += 1;
      }
    } catch {
      stat[src].fail += 1;
    }

    await sleep(GAP_MS);
  }

  console.log("Результат по источникам:");
  console.log("  источник                 текст  мало  отказ  пропущено");
  for (const [src, s] of Object.entries(stat).sort((a, b) => b[1].ok - a[1].ok)) {
    console.log(
      `  ${src.padEnd(24)} ${String(s.ok).padStart(5)} ${String(s.short).padStart(5)} ${String(s.fail).padStart(6)} ${String(s.skipped).padStart(10)}`,
    );
  }
  console.log(`\n${APPLY ? "записано" : "получилось бы добрать"}: ${filled} из ${docs.length}`);

  if (APPLY) {
    const withText = await news.countDocuments({
      status: "published",
      isDuplicate: false,
      $expr: { $gte: [{ $strLenCP: { $ifNull: ["$content", ""] } }, MIN_LEN] },
    });
    const inFeed = await news.countDocuments({ status: "published", isDuplicate: false });
    console.log(
      `в ленте с полным текстом: ${withText} из ${inFeed} (${Math.round((withText / inFeed) * 100)}%)`,
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
