import express from "express";
import requireInternalToken from "../../middlewares/internalAuth.js";
import { withLock, LOCK_KEYS } from "../../utils/redisLock.js";
import {
  runConferenceIngestion,
  enrichConference,
  enrichPending,
} from "./conference.ingestion.js";
import Conference from "./conference.model.js";
import { translatePending, translateConferenceAll } from "./conference.translate.js";
import {
  CATEGORY_CODES,
  listConferences,
  getConferenceBySlug,
  listDrafts,
  upsertDraft,
  moderateConference,
} from "./conference.service.js";

const router = express.Router();

// Язык карточек. Имена параметров те же, что на витринах клиник и в новостях:
// `locale` каноничный, `lang` остаётся ради живых ссылок, заголовок — для
// вызовов из бэкенда.
function resolveLang(req) {
  const raw =
    req.query.locale || req.query.lang || req.get("x-language") || "";
  const lang = String(raw).slice(0, 5).toLowerCase();
  return ["ru", "en", "az", "tr", "ar"].includes(lang) ? lang : "";
}

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
      lang: resolveLang(req),
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
    const { title, url, startDate, endDate } = req.body || {};
    if (!title || !url) {
      return res.status(400).json({ success: false, message: "title and url are required" });
    }
    // Прошедшее не заводим и вручную: карточка создалась бы, но в очереди не
    // показалась — и человек решил бы, что форма не сработала.
    const ends = endDate || startDate;
    if (ends && new Date(ends) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Конференция уже прошла — такие карточки не заводим",
      });
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

// Добор подробностей со страницы самой конференции. Отдельно от обхода:
// страницу мероприятия можно перечитать, не обходя заново все источники.
router.post("/admin/enrich", requireInternalToken, async (req, res) => {
  try {
    const result = await enrichPending({ limit: req.body?.limit });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/admin/:id/enrich", requireInternalToken, async (req, res) => {
  try {
    const doc = await Conference.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    const result = await enrichConference(doc);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Перевод опубликованных карточек на языки интерфейса.
router.post("/admin/translate", requireInternalToken, async (req, res) => {
  try {
    const result = await translatePending({ limit: req.body?.limit });
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

    // Перевод запускаем ПОСЛЕ ответа: он занимает несколько вызовов модели, а
    // модератор не должен ждать их, нажав «Опубликовать». Ошибка перевода не
    // отменяет публикацию — карточка уже в витрине, просто пока по-английски.
    if (doc.status === "published" && doc.translationStatus !== "done") {
      translateConferenceAll(doc.toObject ? doc.toObject() : doc).catch((e) =>
        console.error("[conferences] перевод не удался:", e.message),
      );
    }
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Ставим последним: одно-сегментный /:slug иначе перехватил бы /categories.
router.get("/:slug", async (req, res) => {
  try {
    const doc = await getConferenceBySlug(req.params.slug, resolveLang(req));
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, conference: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
