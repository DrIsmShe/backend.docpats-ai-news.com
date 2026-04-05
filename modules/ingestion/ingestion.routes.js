// modules/ingestion/ingestion.routes.js
// НОВЫЙ ФАЙЛ — HTTP-роуты для ручного запуска ingestion и диагностики

import express from "express";
import { runRSS, diagnose } from "./ingestion.controller.js";

const router = express.Router();

// POST /api/ingestion/run — запустить парсинг вручную
// Используй: curl -X POST https://your-api.com/api/ingestion/run
router.post("/run", runRSS);

// GET /api/ingestion/diagnose — проверить состояние системы
// Возвращает: кол-во источников, статей, последний запуск, ошибки RSS
router.get("/diagnose", diagnose);

export default router;
