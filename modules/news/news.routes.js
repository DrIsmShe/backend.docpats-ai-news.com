import express from "express";
import { getLatestNews, feed, article } from "./news.controller.js";
import News from "./news.model.js";
import { translateContent } from "./newstranslate.controller.js";
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
router.post("/:slug/translate-content", translateContent); // ← потом
router.get("/:slug", article);
// 🔥 СНАЧАЛА categories

export default router;
