import "dotenv/config";

import express from "express";
import cors from "cors";

import connectMongo from "./config/mongo.js";
import "./config/redis.js";

import trendRoutes from "./modules/trends/trends.routes.js";
import newsRoutes from "./modules/news/news.routes.js";
import briefingRoutes from "./modules/briefing/briefing.routes.js";
import ingestionRoutes from "./modules/ingestion/ingestion.routes.js";
import synthesisRoutes from "./modules/synthesis/synthesis.routes.js";
import searchRoutes from "./modules/search/search.routes.js";
import conferenceRoutes from "./modules/conferences/conference.routes.js";

import { startScheduler } from "./modules/scheduler/scheduler.js";
import { requireInternalToken } from "./middlewares/internalAuth.js";
import { withLock, LOCK_KEYS } from "./utils/redisLock.js";
import jobSwitchRoutes from "./modules/settings/jobSwitches.routes.js";

// Синтез может идти долго: до трёх попыток генерации с паузами между ними.
const SYNTHESIS_LOCK_TTL_MS = 30 * 60 * 1000;

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

// Запуск синтеза — POST, а не GET: генерация статьи меняет состояние и стоит
// денег, а GET по адресу мог запустить кто угодно, кому ссылка попалась на
// глаза, — краулер, префетч браузера, бот превью ссылок в мессенджере.
app.post("/api/synthesis/run-now", requireInternalToken, async (req, res) => {
  try {
    // Блокировка общая с ночным cron: ручной запуск во время работы крона
    // (и наоборот) получит отказ вместо второй оплаченной генерации.
    const { acquired, result } = await withLock(
      LOCK_KEYS.synthesis,
      SYNTHESIS_LOCK_TTL_MS,
      async () => {
        const { runSynthesis } = await import(
          "./modules/synthesis/synthesis.service.js"
        );
        return runSynthesis({ hoursBack: 72, maxGroups: 1 });
      },
    );

    if (!acquired) {
      return res.status(409).json({ success: false, message: "Already running" });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Старый GET-адрес: отвечаем понятной ошибкой вместо 404, чтобы привычный
// вызов из браузера не выглядел как «эндпоинт пропал». Работу не выполняет.
app.get("/api/synthesis/run-now", (req, res) =>
  res.status(405).set("Allow", "POST").json({
    success: false,
    message:
      "Use POST /api/synthesis/run-now with the x-internal-token header. " +
      "GET is disabled: article generation costs money and must not be triggered by a link preview or crawler.",
  }),
);

app.use("/api/trends", trendRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/briefing", briefingRoutes);
app.use("/api/ingestion", ingestionRoutes);
app.use("/api/synthesis", synthesisRoutes);
// Поиск по архиву. Роут существовал, но смонтирован не был — /api/search
// отвечал 404, а поле поиска на странице было закомментировано.
app.use("/api/search", searchRoutes);
// Конференции. Витрина отдаёт только опубликованное; всё, что решает, ЧТО
// увидят врачи, лежит под /admin и закрыто внутренним токеном.
app.use("/api/conferences", conferenceRoutes);

// Управление фоновыми задачами: включить и выключить сбор новостей,
// генерацию статей, перевод. Закрыто внутренним токеном — ходит только
// админка DocPats, в браузер токен не попадает.
app.use("/api/job-switches", jobSwitchRoutes);

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
