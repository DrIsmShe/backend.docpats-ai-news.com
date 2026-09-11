import express from "express";
import { getLatestNews, feed, article } from "./news.controller.js";
import News from "./news.model.js";
const router = express.Router();

router.get("/", getLatestNews);
router.get("/feed", feed);
router.get("/categories", async (req, res) => {
  try {
    const categories = await News.aggregate([
      { $match: { status: "published", isDuplicate: false } },
      { $unwind: "$specialties" }, // разворачиваем массив
      {
        $group: {
          _id: "$specialties",
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: "general" } } }, // убираем general из списка
      { $sort: { count: -1 } },
    ]);

    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
/* Перевод полного текста чужой публикации — выключен.
 *
 * Эндпоинт переводил до 8000 знаков текста, снятого с сайта издания, и
 * складывал перевод в нашу базу. То есть делал из чужого произведения
 * производное и раздавал его. Полного текста детальный ответ больше не
 * содержит вовсе (см. getBySlug), так что переводить тут нечего.
 *
 * 410, а не 404: адрес существовал и убран намеренно — это разные вещи и
 * для клиента, и для поисковика.
 */
router.post("/:slug/translate-content", (req, res) =>
  res.status(410).json({
    success: false,
    message:
      "Full-text translation is retired. Use /api/digest/:slug — our own summary with a link to the publisher.",
  }),
);
router.get("/:slug", article);
// 🔥 СНАЧАЛА categories

export default router;
