import Cluster from "./cluster.model.js";
import { cosineSimilarity } from "../../utils/vector.js";

async function assignArticleToCluster(articleDoc) {
  if (!articleDoc.embedding || !articleDoc.embedding.length) {
    return null;
  }

  const recentClusters = await Cluster.find()
    .sort({ updatedAt: -1 })
    .limit(100);

  let bestCluster = null;
  let bestScore = 0;

  for (const cluster of recentClusters) {
    if (!cluster.embedding || !cluster.embedding.length) continue;
    if (cluster.embedding.length !== articleDoc.embedding.length) continue;

    const score = cosineSimilarity(articleDoc.embedding, cluster.embedding);

    if (score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
    }
  }

  // attach to existing cluster
  if (bestCluster && bestScore >= 0.88) {
    if (!bestCluster.articleIds.includes(articleDoc._id)) {
      bestCluster.articleIds.push(articleDoc._id);
    }

    bestCluster.articleCount += 1;
    bestCluster.lastArticleAt = articleDoc.publishedAt || new Date();

    if (!bestCluster.title && articleDoc.title) {
      bestCluster.title = articleDoc.title;
    }

    if (!bestCluster.summary && articleDoc.aiSummary) {
      bestCluster.summary = articleDoc.aiSummary;
    }

    try {
      await bestCluster.save();
    } catch (err) {
      console.error("Cluster save error:", err.message);
    }

    articleDoc.clusterId = bestCluster._id;

    try {
      await articleDoc.save();
    } catch (err) {
      console.error("Article save error:", err.message);
    }

    return bestCluster;
  }

  // create new cluster
  let newCluster = null;

  try {
    newCluster = await Cluster.create({
      title: articleDoc.title || "",
      summary: articleDoc.aiSummary || articleDoc.summary || "",
      specialty: articleDoc.specialty || "general",
      keywords: [],
      articleIds: [articleDoc._id],
      embedding: articleDoc.embedding,
      articleCount: 1,
      trendScore: 0,
      lastArticleAt: articleDoc.publishedAt || new Date(),
    });
  } catch (err) {
    console.error("Cluster create error:", err.message);
    return null;
  }

  articleDoc.clusterId = newCluster._id;

  try {
    await articleDoc.save();
  } catch (err) {
    console.error("Article save error:", err.message);
  }

  return newCluster;
}

export { assignArticleToCluster };
