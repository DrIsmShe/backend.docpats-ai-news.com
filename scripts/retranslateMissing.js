// scripts/retranslateMissing.js
//
// Догон переводов: отсутствующих и устаревших.
//
// Два разных случая, и оба сами не рассосутся, потому что ночная задача
// берёт только свежие статьи:
//
//   1. ПЕРЕВОДА НЕТ. С апреля по август переводы на az, tr и ar срывались
//      по таймауту — длинная генерация шла без потоковой передачи.
//
//   2. ПЕРЕВОД УСТАРЕЛ. Статью дописали после обрыва, и перевод остался
//      сделанным с обрезанного текста: на русском статья дочитывается до
//      конца, а на арабском обрывается там же, где обрывалась раньше.
//
// Второй случай опаснее первого: отсутствие перевода видно сразу, а
// устаревший выглядит целым.
//
// Признак устаревания — перевод сделан РАНЬШЕ, чем статью дописали.
// Отдельного флага не нужно: finishedAt ставит скрипт дописывания.
//
// Запуск:  node scripts/retranslateMissing.js [сколько статей]

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const LIMIT = Number(process.argv[2] || 10);
const LOCALES = ["en", "az", "tr", "ar"];

function needsWork(article) {
  const tr = article.translations || {};
  const finishedAt = article.finishedAt ? new Date(article.finishedAt) : null;

  const missing = LOCALES.filter((l) => !tr[l]?.title);
  const stale = finishedAt
    ? LOCALES.filter((l) => {
        const at = tr[l]?.translatedAt;
        return at && new Date(at) < finishedAt;
      })
    : [];

  return { missing, stale, need: missing.length + stale.length > 0 };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL);

  const { default: Synthesis } = await import(
    "../modules/synthesis/synthesis.model.js"
  );
  const { translateAllLocales } = await import(
    "../modules/synthesis/synthesis.controller.js"
  );

  const col = mongoose.connection.db.collection("syntheses");
  const all = await col
    .find({ status: "published" })
    .sort({ createdAt: -1 })
    .project({ title: 1, translations: 1, finishedAt: 1 })
    .toArray();

  const pending = all
    .map((a) => ({ a, ...needsWork(a) }))
    .filter((x) => x.need);

  const staleCount = pending.filter((x) => x.stale.length).length;
  console.log(
    `Требуют перевода: ${pending.length} (из них с устаревшим переводом: ${staleCount}). Берём ${Math.min(LIMIT, pending.length)}.`,
  );

  let done = 0;
  for (const { a, missing, stale } of pending.slice(0, LIMIT)) {
    console.log(`
[${done + 1}] ${String(a.title).slice(0, 62)}`);
    if (missing.length) console.log(`  нет перевода: ${missing.join(", ")}`);
    if (stale.length) console.log(`  устарел: ${stale.join(", ")}`);

    try {
      // Модель Synthesis нужна целиком: translateAllLocales читает body.
      const article = await Synthesis.findById(a._id);
      const t0 = Date.now();
      await translateAllLocales(article);
      const after = await col.findOne(
        { _id: a._id },
        { projection: { translations: 1 } },
      );
      console.log(
        `  стало: ${Object.keys(after.translations || {}).sort().join(",")} за ${Math.round((Date.now() - t0) / 1000)}s`,
      );
    } catch (err) {
      console.error(`  не удалось: ${err.message}`);
    }
    done += 1;
  }

  await mongoose.disconnect();
  console.log(`
Готово: обработано ${done}.`);
}

main().catch((err) => {
  console.error("Догон упал:", err.message);
  process.exit(1);
});
