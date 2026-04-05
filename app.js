import "dotenv/config";

import express from "express";
import cors from "cors";

import connectMongo from "./config/mongo.js";
import "./config/redis.js";

import trendRoutes from "./modules/trends/trends.routes.js";
import newsRoutes from "./modules/news/news.routes.js";
import briefingRoutes from "./modules/briefing/briefing.routes.js";
import ingestionRoutes from "./modules/ingestion/ingestion.routes.js";
import synthesisRoutes from "./modules/synthesis/synthesis.routes.js"; // ← ДОБАВИТЬ

import { startScheduler } from "./modules/scheduler/scheduler.js";

const app = express();

app.use(
  cors({
    origin: [
      "https://docpats.com",
      "https://app.docpats.com",
      "http://localhost:3000",
    ],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) =>
  res.status(200).json({
    success: true,
    service: "DocPats News Engine",
    status: "running",
  }),
);
let isSynthesisRunning = false;

app.get("/api/synthesis/run-now", async (req, res) => {
  if (isSynthesisRunning) {
    return res.json({ success: false, message: "Already running" });
  }
  try {
    isSynthesisRunning = true;
    const { runSynthesis } =
      await import("./modules/synthesis/synthesis.service.js");
    const result = await runSynthesis({ hoursBack: 72, maxGroups: 2 });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    isSynthesisRunning = false;
  }
});
app.use("/api/trends", trendRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/briefing", briefingRoutes);
app.use("/api/ingestion", ingestionRoutes);
app.use("/api/synthesis", synthesisRoutes); // ← ДОБАВИТЬ

app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);

const PORT = process.env.PORT || 5010;

async function bootstrap() {
  await connectMongo();
  startScheduler();
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
