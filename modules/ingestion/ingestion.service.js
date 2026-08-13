// modules/ingestion/ingestion.service.js
// ✅ ИСПРАВЛЕНИЯ:
//   1. Добавлено детальное логирование каждого шага
//   2. Ошибки больше не глотаются тихо
//   3. processSource обрабатывает статьи последовательно (без лишних race conditions)
//   4. RSS-переводы УБРАНЫ из ингеста — теперь lazy через POST /api/news/:slug/translate-content

import Source from "../sources/source.model.js";
import News from "../news/news.model.js";
import { analyzeArticle } from "../ai/ai.service.js";
import { createEmbedding } from "../ai/embedding.service.js";
import { fetchRSS } from "./fetchers/rss.fetcher.js";
import { fetchPubMed } from "./fetchers/pubmed.fetcher.js";
import { hybridClassify } from "../ai/hybridClassifier.js";
import { assignArticleToCluster } from "../clustering/clustering.service.js";
import { extractFullContent } from "../news/news.service.js";
import { classifyForFeed } from "./editorialFilter.js";
import { makeHash } from "../../utils/hash.js";
import { cosineSimilarity } from "../../utils/vector.js";
import slugify from "slugify";

const MAX_EMBED_TEXT = 2000;

// Ниже этой длины текст — не статья, а подпись под ссылкой. Тот же порог, по
// которому лента считает hasFullText (modules/news/news.service.js): пороги
// обязаны совпадать, иначе материал пройдёт загрузку и тут же будет помечен
// «только аннотация».
const MIN_FULL_TEXT = 500;

export async function fetchArticlesFromSource(source) {
  if (source.type === "rss") return fetchRSS(source);
  if (source.type === "api" && source.slug === "pubmed")
    return fetchPubMed(source);
  console.warn(`⚠️ Unknown source type: ${source.type} for ${source.slug}`);
  return [];
}

/**
 * Дата публикации не может быть в будущем.
 *
 * Предохранитель на общем пути, независимо от источника. Точную логику дат
 * знает фетчер (у PubMed это выбор между epubdate и pubdate), но полагаться
 * только на неё нельзя: лента сортируется по publishedAt, и одна запись с
 * датой «через полгода» встаёт вверху страницы и остаётся там навсегда.
 * Пропускаем сутки запаса — на часовые пояса источников.
 */
function notInFuture(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.valueOf())) return new Date();
  const limit = new Date(Date.now() + 864e5);
  return parsed > limit ? new Date() : parsed;
}

export function normalizeArticle(article = {}) {
  return {
    externalId: article.externalId || null,
    title: (article.title || "").trim(),
    summary: (article.summary || "").trim(),
    content: (article.content || "").trim(),
    canonicalUrl: (article.canonicalUrl || "").trim(),
    publishedAt: notInFuture(article.publishedAt),
    authors: Array.isArray(article.authors) ? article.authors : [],
    journal: article.journal || null,
    // Идентификаторы первоисточника. Без них ссылка на работу держится только
    // на URL источника, а он меняется; DOI и PMID — постоянные.
    doi: article.doi || extractDoiFromUrl(article.canonicalUrl) || null,
    pmid: article.pmid || null,
  };
}

/**
 * DOI из адреса статьи.
 *
 * У части источников DOI не приходит отдельным полем, но стоит прямо в ссылке:
 * journals.plos.org/plosone/article?id=10.1371/journal.pone.0346364.
 * Формат DOI: «10.» + регистрант + «/» + суффикс.
 */
function extractDoiFromUrl(url) {
  const match = String(url || "").match(/\b(10\.\d{4,9}\/[^\s?&#"']+)/i);
  if (!match) return null;
  // Хвостовая пунктуация из адреса в DOI не входит.
  return match[1].replace(/[.,;)]+$/, "");
}

export function buildSlug(title) {
  return (
    slugify(title || "article", { lower: true, strict: true, trim: true }) +
    "-" +
    Date.now() +
    "-" +
    Math.floor(Math.random() * 10000)
  );
}

function buildEmbeddingText(article) {
  return `${article.title || ""}\n${article.summary || ""}\n${article.content || ""}`.slice(
    0,
    MAX_EMBED_TEXT,
  );
}

export async function isSemanticDuplicate(embedding) {
  if (!embedding || !embedding.length) return false;

  const recentArticles = await News.find({
    embedding: { $exists: true, $ne: [] },
  })
    .sort({ publishedAt: -1 })
    .limit(40)
    .select("embedding");

  for (const existing of recentArticles) {
    if (!existing.embedding) continue;
    if (existing.embedding.length !== embedding.length) continue;
    if (cosineSimilarity(embedding, existing.embedding) >= 0.92) return true;
  }

  return false;
}

async function processArticle(source, rawArticle) {
  const article = normalizeArticle(rawArticle);

  // ── Базовые проверки ──
  if (!article.canonicalUrl || !article.title) {
    console.log(
      `  ⏭ Skipped (no url/title): "${article.title?.slice(0, 50)}"`,
    );
    return { inserted: 0, skipped: 1, reason: "no_url_or_title" };
  }

  // ── Непригодное для ленты ──
  //
  // Раньше всего остального: отозванные работы, поправки и исследования не
  // про людей не должны доходить ни до извлечения текста, ни до модели —
  // это трата и денег, и времени на то, что показывать всё равно нельзя.
  const editorial = classifyForFeed(article);
  if (editorial.excluded) {
    console.log(`  ⏭ Skipped (${editorial.reason}): "${article.title.slice(0, 50)}"`);
    return { inserted: 0, skipped: 1, reason: editorial.reason };
  }

  // ── URL-дедупликация ──
  const urlHash = makeHash(article.canonicalUrl);
  const exists = await News.findOne({ urlHash }).select("_id");
  if (exists) {
    return { inserted: 0, skipped: 1, reason: "url_duplicate" };
  }

  // ── Извлечь контент если слишком короткий ──
  let parsed = { content: "", image: "" };
  if (!article.content || article.content.length < 200) {
    try {
      parsed = await extractFullContent(article.canonicalUrl);
      if (parsed.content) article.content = parsed.content;
    } catch (err) {
      console.warn(`  ⚠️ extractFullContent failed: ${err.message}`);
    }
  }

  // ── Нет полного текста — не берём вовсе ──
  //
  // Раньше такой материал сохранялся с одной аннотацией, и карточка обещала
  // «читать полностью», а уводила на сайт издателя. Треть ленты состояла из
  // таких: 970 материалов STAT News за платной стеной, 1698 CDC с уже
  // протухшими ссылками. Врач кликал и упирался либо в подписку, либо в 404.
  //
  // Свежий поток от этого не страдает — замер на живой базе: за последние семь
  // дней полный текст есть у 347 материалов из 347, за месяц — у 1521 из 1534.
  // Отсекается почти исключительно то, что и раньше было нечитаемым.
  //
  // Проверка стоит ДО обращений к модели: разбор и векторизация материала,
  // который мы всё равно не покажем, — это прямая трата денег. На той же
  // выборке экономия около трети вызовов.
  //
  // Выключатель на случай, если решение окажется неверным: при
  // INGEST_REQUIRE_FULL_TEXT=off вернётся прежнее поведение.
  if (process.env.INGEST_REQUIRE_FULL_TEXT !== "off") {
    const textLength = String(article.content || "").trim().length;
    if (textLength < MIN_FULL_TEXT) {
      console.log(
        `  ⏭ Skipped (no_full_text, ${textLength} знаков): "${article.title.slice(0, 50)}"`,
      );
      return { inserted: 0, skipped: 1, reason: "no_full_text" };
    }
  }

  // ── AI ANALYSIS ──
  let ai = {
    summary: article.summary,
    specialty: "general",
    importanceScore: 50,
  };
  try {
    ai = await analyzeArticle({
      ...article,
      content: article.content || article.summary,
    });
  } catch (error) {
    console.warn(`  ⚠️ AI analyze error: ${error.message}`);
  }

  // ── HYBRID CLASSIFICATION ──
  let classification = {
    type: "news",
    specialty: ai.specialty || "general",
    specialties: [ai.specialty || "general"],
    tags: [],
  };
  try {
    classification = await hybridClassify({
      ...article,
      sourceSlug: source.slug,
      sourceName: source.name,
    });
  } catch (error) {
    console.warn(`  ⚠️ hybridClassify error: ${error.message}`);
  }
  if (!classification.specialties)
    classification.specialties = [classification.specialty || "general"];
  if (!classification.tags) classification.tags = [];

  // ── EMBEDDING ──
  let embedding = [];
  try {
    embedding = await createEmbedding(buildEmbeddingText(article));
  } catch (error) {
    console.warn(`  ⚠️ Embedding error: ${error.message}`);
  }

  // ── Семантическая дедупликация (только если есть embedding) ──
  if (embedding.length) {
    const duplicate = await isSemanticDuplicate(embedding);
    if (duplicate) {
      return { inserted: 0, skipped: 1, reason: "semantic_duplicate" };
    }
  }

  const slug = buildSlug(article.title);

  // ── SAVE ──
  let news;
  try {
    news = await News.create({
      sourceId: source._id,
      sourceName: source.name,
      sourceSlug: source.slug,

      externalId: article.externalId,
      imageUrl: rawArticle.imageUrl || parsed.image || "",
      canonicalUrl: article.canonicalUrl,
      urlHash,

      title: article.title,
      titleNormalized: article.title.toLowerCase(),
      summary: article.summary,
      content: article.content,
      status: "published",
      slug,

      aiSummaryShort: ai.summary || article.summary,
      aiSummaryLong: "",

      type: classification.type || "news",
      specialty: classification.specialty || "general",
      specialties: Array.isArray(classification.specialties)
        ? classification.specialties
        : [classification.specialty || "general"],
      tags: Array.isArray(classification.tags) ? classification.tags : [],
      importanceScore:
        typeof ai.importanceScore === "number" ? ai.importanceScore : 50,

      authors: article.authors,
      journal: article.journal,
      embedding,
      publishedAt: article.publishedAt,

      // Идентификаторы первоисточника: normalizeArticle их уже вычислил
      // (в том числе вытащив DOI из адреса статьи). Раньше эти два поля не
      // заполнялись вовсе — ни у одного из 9079 материалов.
      doi: article.doi,
      pmid: article.pmid,

      isDuplicate: false,
      translationStatus: "pending",
    });

    console.log(`  ✅ Saved: "${article.title.slice(0, 60)}"`);
  } catch (error) {
    console.error(
      `  ❌ Insert error for "${article.title?.slice(0, 50)}": ${error.message}`,
    );
    return {
      inserted: 0,
      skipped: 1,
      reason: "insert_error",
      error: error.message,
    };
  }

  // ── CLUSTERING (fire-and-forget) ──
  assignArticleToCluster(news).catch((err) =>
    console.error("Clustering error:", err.message),
  );

  // ── TRANSLATION ──
  // RSS-статьи переводятся ON-DEMAND при просмотре пользователем
  // через POST /api/news/:slug/translate-content (newstranslate.controller.js).
  // Автоматический перевод 5×N статей/день отключён для экономии API.

  return { inserted: 1, skipped: 0 };
}

export async function processSource(source) {
  let articles = [];
  try {
    articles = await fetchArticlesFromSource(source);
    console.log(`📥 ${source.slug}: fetched ${articles.length} articles`);
  } catch (error) {
    console.error(`❌ Fetch error [${source.slug}]: ${error.message}`);
    return {
      source: source.slug,
      fetched: 0,
      inserted: 0,
      skipped: 0,
      error: error.message,
    };
  }

  let inserted = 0;
  let skipped = 0;

  for (const article of articles) {
    const result = await processArticle(source, article);
    inserted += result.inserted;
    skipped += result.skipped;
  }

  console.log(`✓ ${source.slug}: inserted=${inserted}, skipped=${skipped}`);
  return { source: source.slug, fetched: articles.length, inserted, skipped };
}

export async function runIngestion() {
  const sources = await Source.find({ isActive: true });
  console.log(`\n🚀 Starting ingestion for ${sources.length} active sources`);

  if (sources.length === 0) {
    console.warn(
      "⚠️ No active sources found! Run: POST /api/ingestion/seed-sources or check sources in DB",
    );
    return {
      success: false,
      message: "No active sources",
      fetched: 0,
      inserted: 0,
      skipped: 0,
      sources: [],
    };
  }

  // Обрабатываем источники последовательно (не parallel) — меньше нагрузки на API
  const results = [];
  for (const source of sources) {
    const result = await processSource(source);
    results.push(result);
  }

  const fetched = results.reduce((s, r) => s + r.fetched, 0);
  const inserted = results.reduce((s, r) => s + r.inserted, 0);
  const skipped = results.reduce((s, r) => s + r.skipped, 0);

  console.log(
    `\n📊 Ingestion complete: fetched=${fetched}, inserted=${inserted}, skipped=${skipped}`,
  );

  return { success: true, fetched, inserted, skipped, sources: results };
}

export default { runIngestion };
