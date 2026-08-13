// scripts/fixDatesAndIds.js
//
// Разовая починка накопленных материалов. Две задачи, обе — следствие того,
// что при загрузке бралось не то поле из ответа источника.
//
// 1. ДАТЫ В БУДУЩЕМ. PubMed отдаёт pubdate — дату выпуска журнала, которая
//    часто в будущем: статья доступна онлайн сегодня, а в бумаге выйдет,
//    скажем, в январе 2027. Бралась именно она, и 152 материала висели вверху
//    ленты с датами до 2027 года (лента сортируется по дате). Чиним, спрашивая
//    у PubMed epubdate — когда работа реально появилась онлайн.
//
// 2. DOI И PMID. Были пусты у всех 9079 материалов, хотя DOI стоит прямо в
//    адресе статьи (journals.plos.org/…?id=10.1371/journal.pone.0346364), а
//    PMID — в адресе PubMed. Без них ссылка держится только на URL источника,
//    а он меняется.
//
// Запуск:
//   node scripts/fixDatesAndIds.js          — только показать, что будет
//   node scripts/fixDatesAndIds.js --apply  — записать
//
// Правка идёт по одному полю на документ, остальное не трогается.

import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";

const APPLY = process.argv.includes("--apply");
const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const BATCH = 20;

// NCBI: не чаще 3 запросов в секунду без ключа. Берём с запасом.
const GAP_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** DOI из адреса статьи. «10.» + регистрант + «/» + суффикс. */
function extractDoiFromUrl(url) {
  const match = String(url || "").match(/\b(10\.\d{4,9}\/[^\s?&#"']+)/i);
  if (!match) return null;
  return match[1].replace(/[.,;)]+$/, "");
}

/** PMID из адреса PubMed. */
function extractPmidFromUrl(url) {
  const match = String(url || "").match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  return match ? match[1] : null;
}

/** Когда работа стала доступна: epubdate, иначе первая дата не из будущего. */
function availableSince(item, fallback, now = new Date()) {
  for (const raw of [item?.epubdate, item?.sortpubdate, item?.pubdate]) {
    if (!raw) continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.valueOf()) && parsed <= now) return parsed;
  }
  // PubMed не дал ни одной прошедшей даты — берём момент, когда мы материал
  // забрали: он тогда уже существовал.
  return fallback && fallback <= now ? fallback : now;
}

async function pubmedSummaries(ids) {
  const { data } = await axios.get(`${PUBMED_BASE}/esummary.fcgi`, {
    params: { db: "pubmed", id: ids.join(","), retmode: "json" },
    timeout: 30000,
  });
  return data?.result || {};
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  await mongoose.connect(uri, {
    dbName: process.env.MONGO_DB || "DOCPATS_AI_NEWS",
  });
  const news = mongoose.connection.db.collection("news");
  const now = new Date();

  console.log(APPLY ? "РЕЖИМ: запись" : "РЕЖИМ: пробный прогон (ничего не пишем)");
  console.log("");

  // ── 1. Даты в будущем ────────────────────────────────────────────────
  const future = await news
    .find({ publishedAt: { $gt: now } })
    .project({ _id: 1, title: 1, publishedAt: 1, externalId: 1, canonicalUrl: 1, fetchedAt: 1 })
    .toArray();

  console.log(`Материалов с датой в будущем: ${future.length}`);

  let fixedDates = 0;
  let unresolved = 0;

  for (let i = 0; i < future.length; i += BATCH) {
    const chunk = future.slice(i, i + BATCH);
    const ids = chunk
      .map((d) => d.externalId || extractPmidFromUrl(d.canonicalUrl))
      .filter(Boolean);

    let summaries = {};
    if (ids.length > 0) {
      try {
        summaries = await pubmedSummaries(ids);
      } catch (err) {
        console.warn(`  ! PubMed не ответил на пачку: ${err.message}`);
      }
      await sleep(GAP_MS);
    }

    for (const doc of chunk) {
      const pmid = doc.externalId || extractPmidFromUrl(doc.canonicalUrl);
      const item = pmid ? summaries[pmid] : null;
      const corrected = availableSince(item, doc.fetchedAt, now);

      if (!item) unresolved += 1;

      if (i === 0 && fixedDates < 3) {
        console.log(
          `  ${String(doc.publishedAt).slice(0, 10)} → ${corrected
            .toISOString()
            .slice(0, 10)}  ${String(doc.title).slice(0, 55)}`,
        );
      }

      if (APPLY) {
        await news.updateOne(
          { _id: doc._id },
          { $set: { publishedAt: corrected } },
        );
      }
      fixedDates += 1;
    }
  }

  console.log(`  исправлено дат: ${fixedDates}`);
  if (unresolved > 0) {
    console.log(`  из них PubMed не опознал: ${unresolved} — взята дата загрузки`);
  }

  // ── 2. DOI и PMID ────────────────────────────────────────────────────
  console.log("");
  const missing = await news
    .find({ $or: [{ doi: { $in: [null, ""] } }, { pmid: { $in: [null, ""] } }] })
    .project({ _id: 1, canonicalUrl: 1, doi: 1, pmid: 1, externalId: 1 })
    .toArray();

  console.log(`Материалов без DOI или PMID: ${missing.length}`);

  let setDoi = 0;
  let setPmid = 0;
  const ops = [];

  for (const doc of missing) {
    const patch = {};

    if (!doc.doi) {
      const doi = extractDoiFromUrl(doc.canonicalUrl);
      if (doi) {
        patch.doi = doi;
        setDoi += 1;
      }
    }
    if (!doc.pmid) {
      const pmid = extractPmidFromUrl(doc.canonicalUrl) || doc.externalId || null;
      // externalId у не-PubMed источников — это их внутренний код, не PMID.
      if (pmid && /^\d+$/.test(String(pmid)) && /pubmed/i.test(doc.canonicalUrl || "")) {
        patch.pmid = String(pmid);
        setPmid += 1;
      }
    }

    if (Object.keys(patch).length > 0) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: patch } } });
    }
  }

  console.log(`  можно проставить DOI: ${setDoi}`);
  console.log(`  можно проставить PMID: ${setPmid}`);

  if (APPLY && ops.length > 0) {
    for (let i = 0; i < ops.length; i += 500) {
      await news.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    }
    console.log(`  записано документов: ${ops.length}`);
  }

  // ── Проверка ─────────────────────────────────────────────────────────
  if (APPLY) {
    console.log("");
    console.log("После правки:");
    console.log("  с датой в будущем:", await news.countDocuments({ publishedAt: { $gt: new Date() } }));
    console.log("  с DOI:", await news.countDocuments({ doi: { $nin: [null, ""] } }));
    console.log("  с PMID:", await news.countDocuments({ pmid: { $nin: [null, ""] } }));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
