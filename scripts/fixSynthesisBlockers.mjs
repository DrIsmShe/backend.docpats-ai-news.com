// scripts/fixSynthesisBlockers.mjs
//
// Разовое восстановление после остановки генерации 31.08–09.09.
//
// Две вещи, которые нельзя починить одним лишь кодом:
//
// 1. ИНДЕКС ПО createdAt. Синтез отбирает новости сортировкой по этому
//    полю, а индекса на нём не было: Mongo сортировала 10 000 документов
//    с полными текстами в памяти и упиралась в лимит 32 МБ. Модель теперь
//    объявляет индекс, но на живой базе его надо создать явно — autoIndex
//    в проде отключают, и полагаться на него нельзя.
//
// 2. ПЕРЕКЛЮЧАТЕЛЬ СБОРА. `ingestion: false` стоял с 1 сентября: новых
//    новостей нет — синтезу не из чего делать статью, и починка кода без
//    этого бессмысленна.
//
// Запуск: node scripts/fixSynthesisBlockers.mjs

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
console.log("база:", db.databaseName);

const имя = await db
  .collection("news")
  .createIndex({ createdAt: -1 }, { name: "createdAt_-1" });
console.log("индекс:", имя);

await db.collection("job_switches").updateOne(
  { key: "jobs" },
  {
    $set: {
      ingestion: true,
      lastChange: "Сбор новостей: вкл (восстановление после простоя)",
      updatedAt: new Date(),
    },
  },
);

const итог = await db.collection("job_switches").findOne({ key: "jobs" });
console.log(
  "переключатели:",
  ["ingestion", "synthesis", "translation", "conferences"]
    .map((к) => `${к}=${итог[к] !== false}`)
    .join(" "),
);

await mongoose.disconnect();
