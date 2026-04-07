import Cluster from "../clustering/cluster.model.js";

function calculateFreshnessBoost(ageHours) {
  if (ageHours < 24) return 2.2;
  if (ageHours < 72) return 1.5;
  if (ageHours < 168) return 1.1; // 7 дней
  return 0.7;
}

export async function updateTrendScores() {
  const clusters = await Cluster.find()
    .select("_id articleCount lastArticleAt")
    .limit(500)
    .lean();

  const now = Date.now();

  const operations = [];

  for (const cluster of clusters) {
    const lastArticleAt = cluster.lastArticleAt
      ? new Date(cluster.lastArticleAt).getTime()
      : now;

    const ageHours = (now - lastArticleAt) / 3600000;

    const freshnessBoost = calculateFreshnessBoost(ageHours);

    const baseScore = cluster.articleCount || 0;

    const trendScore = Number((baseScore * freshnessBoost).toFixed(2));

    operations.push({
      updateOne: {
        filter: { _id: cluster._id },
        update: { trendScore },
      },
    });
  }

  if (operations.length) {
    await Cluster.bulkWrite(operations);
  }

  return {
    success: true,
    updated: operations.length,
  };
}

export async function getTopTrends(limit = 10) {
  const safeLimit = Math.min(limit, 50);

  return Cluster.find()
    .sort({
      trendScore: -1,
      articleCount: -1,
      lastArticleAt: -1,
    })
    .limit(safeLimit)
    .populate("articleIds")
    .lean();
}
