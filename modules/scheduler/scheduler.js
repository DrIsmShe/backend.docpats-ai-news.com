// modules/scheduler/scheduler.js
import cron from "node-cron";
import { runIngestion } from "../ingestion/ingestion.service.js";
import { seedSourcesIfEmpty } from "../sources/source.service.js";
import { runSynthesis } from "../synthesis/synthesis.service.js";
import Synthesis from "../synthesis/synthesis.model.js";

export async function startScheduler() {
  console.log("📅 Scheduler initializing...");

  // ── Полное отключение фоновых задач (для локалки) ──
  if (process.env.DISABLE_SCHEDULERS === "true") {
    console.log("⏸  Schedulers DISABLED via DISABLE_SCHEDULERS=true");
    return;
  }

  // 1. Синхронизируем источники
  try {
    const seedResult = await seedSourcesIfEmpty();
    console.log("✅ Sources synced:", seedResult);
  } catch (err) {
    console.error("❌ Seed error:", err.message);
  }

  // 2. Ingestion при старте — асинхронно, не блокирует поднятие сервера
  setImmediate(async () => {
    try {
      console.log("🔄 Running initial ingestion (async)...");
      const result = await runIngestion();
      console.log(
        `✅ Initial ingestion done: inserted=${result.inserted}, skipped=${result.skipped}`,
      );
    } catch (err) {
      console.error("❌ Initial ingestion error:", err.message);
    }
  });

  // 3. Ingestion — 2 раза в день: 03:00 (перед синтезом) и 15:00 (резерв)
  cron.schedule("0 3,15 * * *", async () => {
    console.log("⏰ Scheduled ingestion starting...");
    try {
      const result = await runIngestion();
      console.log(`✅ Scheduled ingestion done: inserted=${result.inserted}`);
    } catch (error) {
      console.error("❌ Scheduler ingestion error:", error.message);
    }
  });

  // 4. Синтез — ровно одна статья в сутки.
  //
  // Основной запуск в 04:00 UTC и два догоняющих: 10:00 и 16:00. Догоняющие
  // работают ТОЛЬКО если за сегодня статьи так и не вышло. Раньше запуск был
  // один, и сорвавшаяся попытка означала день без статьи — именно так вышло с
  // 8 по 12 августа, когда генерация падала по таймауту, а cron исправно
  // рапортовал об успехе с нулевым результатом.
  //
  // Условие смотрит в БАЗУ, а не в память процесса: перезапуск сервера не
  // должен приводить ко второй статье за день.
  const synthesisRun = async (label) => {
    console.log(`🧠 Synthesis cron starting (${label})...`);
    try {
      const result = await runSynthesis({ hoursBack: 72, maxGroups: 1 });
      console.log(`✅ Synthesis done (${label}): generated=${result.generated}`);
    } catch (error) {
      console.error(`❌ Synthesis cron error (${label}):`, error.message);
    }
  };

  cron.schedule("0 4 * * *", () => synthesisRun("основной"));

  for (const hour of [10, 16]) {
    cron.schedule(`0 ${hour} * * *`, async () => {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const todayCount = await Synthesis.countDocuments({
        createdAt: { $gte: startOfDay },
      });

      if (todayCount > 0) {
        console.log(
          `⏭  Synthesis catch-up at ${hour}:00 skipped — статья за сегодня уже есть`,
        );
        return;
      }

      await synthesisRun(`догон ${hour}:00`);
    });
  }

  console.log(
    "📅 Scheduler ready — ingestion at 03:00 & 15:00 UTC, synthesis at 04:00 UTC with catch-up at 10:00 & 16:00 (1 article/day)",
  );
}
