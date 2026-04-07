function getAIConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
  };
}

module.exports = {
  getAIConfig,
};
