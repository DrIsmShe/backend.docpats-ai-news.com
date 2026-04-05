import express from "express";
import { generate, latest } from "./briefing.controller.js";

const router = express.Router();

router.get("/latest", latest);
router.post("/generate", generate);

export default router;
