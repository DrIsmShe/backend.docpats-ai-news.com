import express from "express";
import { getList, getOne, translateArticle } from "./synthesis.controller.js";

const router = express.Router();

router.get("/", getList);

// ВАЖНО: /run-now и другие конкретные маршруты ВЫШЕ /:id
router.post("/:id/translate", translateArticle);

router.get("/:id", getOne);

export default router;
