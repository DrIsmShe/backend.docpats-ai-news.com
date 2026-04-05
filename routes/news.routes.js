import express from "express";

import {
  getLatestNews,
  feed,
  article,
} from "../modules/news/news.controller.js";
import {
  listSources,
  seedSources,
} from "../modules/sources/source.controller.js";
import { runRSS } from "../modules/ingestion/ingestion.controller.js";

const router = express.Router();

router.get("/news", getLatestNews);
router.get("/feed", feed);
router.get("/news/:slug", article);

router.get("/sources", listSources);
router.post("/sources/seed", seedSources);

router.post("/ingestion/rss", runRSS);

export default router;
