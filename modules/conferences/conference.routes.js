import express from "express";
import requireInternalToken from "../../middlewares/internalAuth.js";
import { withLock, LOCK_KEYS } from "../../utils/redisLock.js";
import { runConferenceIngestion } from "./conference.ingestion.js";
import Conference from "./conference.model.js";
import {
  CATEGORY_CODES,
  listConferences,
  getConferenceBySlug,
  listDrafts,
  upsertDraft,
  moderateConference,
} from "./conference.service.js";

const router = express.Router();

// ── Публичная витрина ────────────────────────────────────────────────────
// Отдаёт только status: "published". Черновики и отклонённое наружу не
// уходят: до просмотра человеком карточка может быть чем угодно, включая
// приглашение на хищническую конференцию.

router.get("/categories", (req, res) => {
  res.json({ success: true, categories: CATEGORY_CODES });
});

// Что вообще есть в базе по странам — для выпадающего списка на странице.
router.get("/countries", async (req, res) => {
  try {
    const countries = await Conference.aggregate([
      { $match: { status: "published", country: { $ne: "" } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, countries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { category, country, format, sort, page, limit } = req.query;
    const result = await listConferences({
      categories: category ? String(category).split(",") : [],
      country: country ? String(country) : "",
      format: format ? String(format) : "",
      sort: sort ? String(sort) : "deadline",
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Модерация ────────────────────────────────────────────────────────────
// Под внутренним токеном: это не «админка по адресу», а эндпоинты, которые
// решают, что увидят врачи.

router.get("/admin/drafts", requireInternalToken, async (req, res) => {
  try {
    const items = await listDrafts({ limit: req.query.limit, status: req.query.status });
    res.json({ success: true, items, total: items.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/admin/ingest", requireInternalToken, async (req, res) => {
  try {
    const { title, url } = req.body || {};
    if (!title || !url) {
      return res.status(400).json({ success: false, message: "title and url are required" });
    }
    const result = await upsertDraft(req.body);
    res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      updated: result.updated,
      slug: result.doc.slug,
      validationFlags: result.doc.validationFlags,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Обход источников. POST, а не GET, и под токеном: каждый прогон платит за
// страницы. GET по адресу мог бы запустить кто угодно, кому ссылка попалась
// на глаза, — краулер, префетч браузера, бот превью ссылок в мессенджере.
router.post("/admin/ingest-run", requireInternalToken, async (req, res) => {
  try {
    const { acquired, result } = await withLock(
      LOCK_KEYS.conferenceIngestion,
      20 * 60 * 1000,
      () => runConferenceIngestion({ slug: req.body?.slug }),
    );
    if (!acquired) {
      return res.status(409).json({ success: false, message: "Обход уже идёт" });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/admin/:id/moderate", requireInternalToken, async (req, res) => {
  try {
    const { status, rejectedReason } = req.body || {};
    const doc = await moderateConference(req.params.id, { status, rejectedReason });
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, slug: doc.slug, status: doc.status });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Ставим последним: одно-сегментный /:slug иначе перехватил бы /categories.
router.get("/:slug", async (req, res) => {
  try {
    const doc = await getConferenceBySlug(req.params.slug);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, conference: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
