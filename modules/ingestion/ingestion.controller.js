// modules/ingestion/ingestion.controller.js

import { runIngestion } from "./ingestion.service.js";
import Source from "../sources/source.model.js";
import News from "../news/news.model.js";
import { fetchRSS } from "./fetchers/rss.fetcher.js";

// POST /api/ingestion/run
export async function runRSS(req, res) {
  try {
    console.log("🔄 Manual ingestion triggered via API");
    const result = await runIngestion();

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Ingestion controller error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
      stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    });
  }
}

// GET /api/ingestion/diagnose
// Диагностика: проверяет источники, статьи в БД, тестирует RSS feeds
export async function diagnose(req, res) {
  const report = {
    timestamp: new Date().toISOString(),
    database: {},
    sources: [],
    rssTest: [],
  };

  // 1. Проверяем что в базе
  try {
    const totalNews = await News.countDocuments();
    const published = await News.countDocuments({ status: "published" });
    const duplicates = await News.countDocuments({ isDuplicate: true });
    const latest = await News.findOne()
      .sort({ createdAt: -1 })
      .select("title createdAt sourceName")
      .lean();

    report.database = {
      total: totalNews,
      published,
      notDuplicate: await News.countDocuments({
        status: "published",
        isDuplicate: false,
      }),
      duplicates,
      latest: latest
        ? {
            title: latest.title,
            source: latest.sourceName,
            at: latest.createdAt,
          }
        : null,
    };
  } catch (err) {
    report.database = { error: err.message };
  }

  // 2. Проверяем источники в БД
  try {
    const sources = await Source.find()
      .select("name slug isActive lastFetchedAt type")
      .lean();
    report.sources = sources.map((s) => ({
      name: s.name,
      slug: s.slug,
      type: s.type,
      active: s.isActive,
      lastFetched: s.lastFetchedAt,
    }));
  } catch (err) {
    report.sources = [{ error: err.message }];
  }

  // 3. Тестируем первые 3 активных RSS-источника
  try {
    const activeSources = await Source.find({ isActive: true, type: "rss" })
      .limit(3)
      .lean();

    for (const source of activeSources) {
      try {
        const articles = await fetchRSS(source);
        report.rssTest.push({
          source: source.slug,
          url: source.baseUrl,
          fetched: articles.length,
          sample: articles[0]?.title || null,
          status: "ok",
        });
      } catch (err) {
        report.rssTest.push({
          source: source.slug,
          url: source.baseUrl,
          status: "error",
          error: err.message,
        });
      }
    }
  } catch (err) {
    report.rssTest = [{ error: err.message }];
  }

  return res.json({ success: true, report });
}
