import News from "../news/news.model.js";
import { createEmbedding } from "../ai/embedding.service.js";
import { cosineSimilarity } from "../../utils/vector.js";

export async function semanticSearch(query) {
  const queryEmbedding = await createEmbedding(query);

  const articles = await News.find().sort({ publishedAt: -1 }).limit(200);

  const results = [];

  for (const article of articles) {
    if (!article.embedding) continue;

    const similarity = cosineSimilarity(queryEmbedding, article.embedding);

    results.push({
      article,
      score: similarity,
    });
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, 20);
}
