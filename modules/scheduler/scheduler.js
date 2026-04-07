// modules/scheduler/scheduler.js
// ✅ ИСПРАВЛЕНИЕ: startScheduler теперь async и возвращает Promise
// Это позволяет app.js ждать завершения seed + первого ingestion

import cron from "node-cron";
import { runIngestion } from "../ingestion/ingestion.service.js";
import { seedSourcesIfEmpty } from "../sources/source.service.js";

export async function startScheduler() {
  console.log("📅 Scheduler initializing...");

  // 1. Синхронизируем источники (ждём завершения)
  try {
    const seedResult = await seedSourcesIfEmpty();
    console.log("✅ Sources synced:", seedResult);
  } catch (err) {
    console.error("❌ Seed error:", err.message);
    // Не прерываем — продолжаем даже если seed упал
  }

  // 2. Запускаем ingestion сразу при старте (ждём завершения)
  try {
    console.log("🔄 Running initial ingestion...");
    const result = await runIngestion();
    console.log(
      `✅ Initial ingestion done: inserted=${result.inserted}, skipped=${result.skipped}`,
    );
  } catch (err) {
    console.error("❌ Initial ingestion error:", err.message);
  }

  // 3. Потом каждые 30 минут (не ждём — fire and forget)
  cron.schedule("*/30 * * * *", async () => {
    console.log("⏰ Scheduled ingestion starting...");
    try {
      const result = await runIngestion();
      console.log(`✅ Scheduled ingestion done: inserted=${result.inserted}`);
    } catch (error) {
      console.error("❌ Scheduler ingestion error:", error.message);
    }
  });

  console.log("📅 Scheduler ready — next run in 30 min");
}
