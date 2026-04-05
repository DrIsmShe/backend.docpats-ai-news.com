// modules/ingestion/ingestion.service.js
// ✅ ИСПРАВЛЕНИЯ:
//   1. Добавлено детальное логирование каждого шага
//   2. Ошибки больше не глотаются тихо
//   3. processSource обрабатывает статьи последовательно (без лишних race conditions)

import Source from "../sources/source.model.js";
import News from "../news/news.model.js";
import { analyzeArticle } from "../ai/ai.service.js";
import { createEmbedding } from "../ai/embedding.service.js";
import { fetchRSS } from "./fetchers/rss.fetcher.js";
import { fetchPubMed } from "./fetchers/pubmed.fetcher.js";
import { hybridClassify } from "../ai/hybridClassifier.js";
import { assignArticleToCluster } from "../clustering/clustering.service.js";
import { extractFullContent } from "../news/news.service.js";
import { translateArticle } from "../translate/translation.service.js";
import { makeHash } from "../../utils/hash.js";
import { cosineSimilarity } from "../../utils/vector.js";
import slugify from "slugify";

const MAX_EMBED_TEXT = 2000;

export async function fetchArticlesFromSource(source) {
  if (source.type === "rss") return fetchRSS(source);
  if (source.type === "api" && source.slug === "pubmed")
    return fetchPubMed(source);
  console.warn(`⚠️ Unknown source type: ${source.type} for ${source.slug}`);
  return [];
}

export function normalizeArticle(article = {}) {
  return {
    externalId: article.externalId || null,
    title: (article.title || "").trim(),
    summary: (article.summary || "").trim(),
    content: (article.content || "").trim(),
    canonicalUrl: (article.canonicalUrl || "").trim(),
    publishedAt: article.publishedAt || new Date(),
    authors: Array.isArray(article.authors) ? article.authors : [],
    journal: article.journal || null,
  };
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
      publishedAt: article.publishedAt || new Date(),

      isDuplicate: false,
      translationStatus: "pending",
    });

    console.log(`  ✅ Saved: "${article.title.slice(0, 60)}"`);
  } catch (error) {
    // ✅ УЛУЧШЕНИЕ: логируем полную причину ошибки сохранения
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

  // ── TRANSLATION (fire-and-forget) ──
  translateArticle(news._id).catch((err) =>
    console.error("Translation failed:", err.message),
  );

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
