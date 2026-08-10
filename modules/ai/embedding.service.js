import OpenAI from "openai";
import { embeddingModel } from "../../config/ai.js";

let client = null;

if (process.env.OPENAI_API_KEY) {
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function createEmbedding(text = "") {
  if (!text) return [];

  /**
   * если нет ключа OpenAI — просто не создаём embedding
   */

  if (!client) {
    return [];
  }

  try {
    const response = await client.embeddings.create({
      model: embeddingModel(),
      input: text,
    });

    return response.data?.[0]?.embedding || [];
  } catch (error) {
    console.error("Embedding error:", error.message);
    return [];
  }
}
