// scripts/checkSynthesisQuery.mjs
//
// Проверка того самого запроса, на котором вставала генерация.
//
// Только чтение: повторяем выборку синтеза (сортировка по createdAt,
// лимит 500) и смотрим, проходит ли она. До индекса она падала с
// «Sort exceeded memory limit of 33554432 bytes».
//
// Запуск: node scripts/checkSynthesisQuery.mjs

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
const news = mongoose.connection.db.collection("news");

const ПОЛЯ = {
  title: 1, summary: 1, content: 1, url: 1, source: 1,
  specialties: 1, tags: 1, publishedAt: 1, createdAt: 1, importanceScore: 1,
};

const начало = Date.now();
const строки = await news
  .find({}, { projection: ПОЛЯ })
  .sort({ createdAt: -1 })
  .limit(500)
  .toArray();

console.log(
  `выборка прошла: ${строки.length} новостей за ${Date.now() - начало} мс`,
);
console.log("свежайшая:", строки[0]?.createdAt);

const индексы = await news.indexes();
console.log(
  "индексы:",
  индексы.map((и) => и.name).join(", "),
);

await mongoose.disconnect();
