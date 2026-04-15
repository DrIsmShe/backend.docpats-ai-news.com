// backend/scripts/generate-seo-backfill.js
import { Synthesis } from "../models/synthesis.model.js";
import { generateAllSeo } from "../services/seo.service.js";

const articles = await Synthesis.find({ "seo.ru": { $exists: false } }).select(
  "_id title body",
);

console.log(`Найдено ${articles.length} статей без SEO`);

for (const a of articles) {
  await generateAllSeo(a._id, a.title, a.body);
  await new Promise((r) => setTimeout(r, 2000)); // пауза между запросами
}

console.log("✅ Готово");
