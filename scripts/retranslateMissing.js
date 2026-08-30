// scripts/retranslateMissing.js
//
// Догон переводов, потерянных из-за таймаутов.
//
// С апреля по август переводы на az, tr и ar срывались: длинная генерация
// шла без потоковой передачи и обрывалась на стороне API. Сама причина
// устранена в synthesis.controller.js, но статьи, переведённые тогда лишь
// частично, сами себя не догонят — ночная задача берёт только свежие.
//
// Скрипт идёт от новых к старым и переводит недостающие языки. По одной
// статье за раз и по одному языку: это те же вызовы, что ночью, и
// торопиться некуда — зато видно, где остановились, если прервать.
//
// Запуск:  node scripts/retranslateMissing.js [сколько статей]

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const LIMIT = Number(process.argv[2] || 10);

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL);

  const { default: Synthesis } = await import(
    "../modules/synthesis/synthesis.model.js"
  );
  const { translateAllLocales } = await import(
    "../modules/synthesis/synthesis.controller.js"
  );

  const LOCALES = ["en", "az", "tr", "ar"];

  const articles = await Synthesis.find({ status: "published" })
    .sort({ createdAt: -1 })
    .limit(500);

  const pending = articles.filter((a) => {
    const have = Object.keys(a.translations || {});
    return LOCALES.some((l) => !have.includes(l));
  });

  console.log(
    `Статей без полного набора переводов: ${pending.length}. Берём ${Math.min(LIMIT, pending.length)}.`,
  );

  let done = 0;
  for (const article of pending.slice(0, LIMIT)) {
    const have = Object.keys(article.translations || {}).sort().join(",") || "нет";
    console.log(
      `
[${done + 1}/${Math.min(LIMIT, pending.length)}] ${String(article.title).slice(0, 60)}`,
    );
    console.log(`  было: ${have}`);
    try {
      // translateAllLocales пропускает уже переведённые? Нет — переводит
      // все. Это допустимо: повторный перевод перезаписывает своим же
      // результатом, а выборочный вызов усложнил бы код ради экономии,
      // которая на догоне в несколько десятков статей не важна.
      await translateAllLocales(article);
      const after = await Synthesis.findById(article._id).select("translations");
      console.log(
        `  стало: ${Object.keys(after.translations || {}).sort().join(",")}`,
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
