// modules/settings/jobSwitches.routes.js
//
// Управление фоновыми задачами извне.
//
// Закрыто внутренним токеном — тем же, что и запуск сбора новостей. В
// браузер токен не попадает никогда: панель управления живёт в админке
// DocPats, а та ходит сюда со своей стороны, подставляя токен из
// окружения. Иначе тот, кто откроет исходники страницы, получил бы
// возможность остановить генерацию.

import express from "express";
import internalAuth from "../../middlewares/internalAuth.js";
import {
  getSwitches,
  setSwitches,
  JOBS,
  JOB_TITLES,
} from "./jobSwitches.service.js";

const router = express.Router();

/** Текущее состояние. */
router.get("/", internalAuth, async (req, res) => {
  try {
    const state = await getSwitches({ fresh: true });
    res.json({
      success: true,
      jobs: JOBS.map((id) => ({
        id,
        title: JOB_TITLES[id],
        enabled: state[id] !== false,
      })),
      updatedBy: state.updatedBy,
      lastChange: state.lastChange,
      updatedAt: state.updatedAt,
    });
  } catch (err) {
    console.error("[jobSwitches] чтение:", err.message);
    res.status(500).json({ success: false, message: "не удалось прочитать состояние" });
  }
});

/** Переключить. Тело: { synthesis: false, translation: true, ... } */
router.put("/", internalAuth, async (req, res) => {
  try {
    const by = String(req.body?.by || "admin").slice(0, 120);
    const state = await setSwitches(req.body || {}, by);
    res.json({
      success: true,
      jobs: JOBS.map((id) => ({
        id,
        title: JOB_TITLES[id],
        enabled: state[id] !== false,
      })),
      updatedBy: state.updatedBy,
      lastChange: state.lastChange,
      updatedAt: state.updatedAt,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error("[jobSwitches] запись:", err.message);
    res.status(status).json({ success: false, message: err.message });
  }
});

export default router;
