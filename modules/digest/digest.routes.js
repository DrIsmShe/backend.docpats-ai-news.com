// modules/digest/digest.routes.js
//
// Чтение открыто всем, сборка — только по внутреннему токену.
//
// Сборка стоит денег (вызов модели на каждый материал), поэтому она POST
// и под токеном: GET по такому адресу запустил бы кто угодно, кому ссылка
// попалась на глаза, — краулер, префетч браузера, бот превью ссылок.
// Ровно та же причина, по которой POST-ом сделан запуск синтеза.

import express from "express";
import { список, рубрики, запись } from "./digest.controller.js";
import { собратьПорцию } from "./digest.service.js";
import { requireInternalToken } from "../../middlewares/internalAuth.js";
import { withLock, LOCK_KEYS } from "../../utils/redisLock.js";

const router = express.Router();

// Порция может идти долго: сотня вызовов модели подряд.
const TTL_МС = 60 * 60 * 1000;

router.get("/", список);
// Строго до "/:slug", иначе categories уйдёт в обработчик записи.
router.get("/categories", рубрики);

router.post("/run", requireInternalToken, async (req, res) => {
  try {
    const сколько = Math.min(Number(req.body?.limit) || 100, 300);

    const { acquired, result } = await withLock(LOCK_KEYS.digest, TTL_МС, () =>
      собратьПорцию({ сколько }),
    );

    if (!acquired) {
      return res
        .status(409)
        .json({ success: false, message: "Already running" });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:slug", запись);

export default router;
