import { getTopTrends, updateTrendScores } from "./trends.service.js";

async function topTrends(req, res) {
  try {
    const limit = Number(req.query.limit || 10);

    const items = await getTopTrends(limit);

    return res.json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error("Top trends error:", error.message);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function recalcTrends(req, res) {
  try {
    const result = await updateTrendScores();

    return res.json(result);
  } catch (error) {
    console.error("Trend recalc error:", error.message);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export { topTrends, recalcTrends };
