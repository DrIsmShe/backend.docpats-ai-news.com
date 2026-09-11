// modules/digest/digest.model.js
//
// Дайджест: наше короткое изложение чужой публикации со ссылкой на неё.
//
// ЗАЧЕМ ОТДЕЛЬНАЯ КОЛЛЕКЦИЯ, А НЕ ПОЛЕ В news.
//
// Граница проходит по праву публиковать. В коллекции news лежат полные
// тексты чужих статей — в среднем 25 тысяч знаков, собранные с сайтов
// изданий. Это архив: он полезен для поиска, разбора и генерации, но
// отдавать его наружу нельзя, потому что это чужое произведение.
//
// Здесь лежит только то, что написано НАМИ: три-четыре предложения о том,
// что изучали, на ком и что вышло, плюс ссылка на источник. Это можно
// публиковать, переводить и индексировать.
//
// Разделение коллекциями, а не полями, выбрано намеренно. Правило «не
// забудь исключить content из выборки» живёт ровно до первого нового
// эндпоинта, написанного в спешке. Правило «эта коллекция публикуемая, а
// та не отдаётся никогда» не забывается: у него нет исключений.
//
// ПОЧЕМУ ИЗЛОЖЕНИЕ, А НЕ САММАРИ ИЗ news. Поле aiSummaryShort в архиве
// называется сводкой, но ею не является: проверка восьми материалов
// подряд показала, что оно дословно совпадает с аннотацией самого
// журнала. То есть это тоже чужой текст, просто короче. Изложение здесь
// пишется заново и от фактов.

import mongoose from "mongoose";

const ЯЗЫКИ = ["ru", "en", "az", "tr", "ar"];

/* Изложение на одном языке. Все пять получаются одним вызовом модели:
   так дешевле, чем один вызов плюс четыре перевода. */
const изложениеSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    intro: { type: String, default: "" },
  },
  { _id: false },
);

const digestItemSchema = new mongoose.Schema(
  {
    /* Откуда взято. Ссылка на архивную запись нужна, чтобы не собирать
       дайджест дважды по одному материалу и чтобы можно было вернуться к
       полному тексту при доработке изложения. */
    newsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "News",
      required: true,
      unique: true,
      index: true,
    },

    slug: { type: String, required: true, unique: true, index: true },

    /* Заголовок оригинала — факт, а не произведение: он нужен, чтобы
       читатель узнал материал, и стоит рядом со ссылкой на источник. */
    originalTitle: { type: String, default: "" },

    /* НАШ текст на пяти языках. Ключ — код языка. */
    texts: {
      type: Map,
      of: изложениеSchema,
      default: () => new Map(),
    },

    /* Куда ведёт «читать в источнике». Без него запись бессмысленна:
       дайджест — это указатель, а не замена публикации. */
    canonicalUrl: { type: String, required: true },
    sourceName: { type: String, default: "" },

    specialty: { type: String, default: "general", index: true },
    specialties: { type: [String], default: [] },
    tags: { type: [String], default: [] },

    /* Оценка значимости переносится из архива: она посчитана правилами
       при сборе (modules/ingestion/evidenceScore.js) и определяет порядок
       показа. */
    importanceScore: { type: Number, default: 0, index: true },
    evidenceLevel: {
      type: String,
      enum: ["low", "moderate", "high", ""],
      default: "",
    },
    evidenceSignals: { type: [String], default: [] },

    journal: { type: String, default: "" },
    doi: { type: String, default: "" },
    pmid: { type: String, default: "" },
    publishedAt: { type: Date, index: true },

    /* Состояние выпуска. failed отличает «не смогли написать» от «ещё не
       брались» — без этого молчаливый провал снова стал бы неотличим от
       очереди. */
    status: {
      type: String,
      enum: ["draft", "published", "failed"],
      default: "draft",
      index: true,
    },
    error: { type: String, default: "" },

    /* Сколько раз пытались. Нужен потолок: часть материалов не станет
       дайджестом НИКОГДА — колонка редактора или новость об отрасли не
       содержит ни дизайна, ни выборки, ни результата, и модель честно
       возвращает пустоту. Без счётчика такие записи попадали бы в
       очередь каждую ночь и жгли деньги на заведомо пустой ответ. */
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "digest_items" },
);

/* Лента дайджеста: свежее и значимое сверху, в пределах специальности. */
digestItemSchema.index({ status: 1, publishedAt: -1 });
digestItemSchema.index({ status: 1, specialty: 1, importanceScore: -1 });

export const ЯЗЫКИ_ДАЙДЖЕСТА = ЯЗЫКИ;

export default mongoose.models.DigestItem ||
  mongoose.model("DigestItem", digestItemSchema);
