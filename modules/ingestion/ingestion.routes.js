// modules/ingestion/ingestion.routes.js
// НОВЫЙ ФАЙЛ — HTTP-роуты для ручного запуска ingestion и диагностики

import express from "express";
import { runRSS, diagnose } from "./ingestion.controller.js";
import { requireInternalToken } from "../../middlewares/internalAuth.js";

const router = express.Router();

// POST /api/ingestion/run — запустить парсинг вручную. Требует внутренний токен:
// curl -X POST https://your-api.com/api/ingestion/run -H "x-internal-token: $INTERNAL_API_TOKEN"
router.post("/run", requireInternalToken, runRSS);

// GET /api/ingestion/diagnose — проверить состояние системы
// Возвращает: кол-во источников, статей, последний запуск, ошибки RSS
router.get("/diagnose", diagnose);

export default router;
