const { Queue } = require("bullmq");
const redis = require("./redis");

const sourceFetchQueue = new Queue("source-fetch-queue", {
  connection: redis,
});

const aiEnrichmentQueue = new Queue("ai-enrichment-queue", {
  connection: redis,
});

module.exports = {
  sourceFetchQueue,
  aiEnrichmentQueue,
};
