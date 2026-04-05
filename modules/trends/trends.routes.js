import express from "express";

import { topTrends, recalcTrends } from "./trends.controller.js";

const router = express.Router();

router.get("/top", topTrends);

router.post("/recalculate", recalcTrends);

export default router;
