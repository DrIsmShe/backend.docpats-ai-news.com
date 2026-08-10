import express from "express";
import { getList, getOne, translateArticle } from "./synthesis.controller.js";

const router = express.Router();

router.get("/", getList);

// ВАЖНО: /run-now и другие конкретные маршруты ВЫШЕ /:id
//
// Внутренним токеном НЕ закрывается: это пользовательский путь — фронтенд
// (SynthesisArticlePage) дёргает его, когда читатель открывает статью на
// нерусской локали. Секрет, положенный в публичный бандл, секретом быть
// перестаёт. Первый перевод тратит токены модели, дальше отдаётся из кэша
// (article.translations), поэтому правильная защита здесь — rate limit,
// а не общий токен.
router.post("/:id/translate", translateArticle);

router.get("/:id", getOne);

export default router;
