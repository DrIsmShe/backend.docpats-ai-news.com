// modules/scheduler/scheduler.js
import cron from "node-cron";
import { runIngestion } from "../ingestion/ingestion.service.js";
import { seedSourcesIfEmpty } from "../sources/source.service.js";
import { runSynthesis } from "../synthesis/synthesis.service.js";

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

  // 4. Синтез — каждый день в 04:00 UTC, 1 статья в день
  cron.schedule("0 4 * * *", async () => {
    console.log("🧠 Synthesis cron starting...");
    try {
      const result = await runSynthesis({ hoursBack: 72, maxGroups: 1 });
      console.log(`✅ Synthesis done: generated=${result.generated}`);
    } catch (error) {
      console.error("❌ Synthesis cron error:", error.message);
    }
  });

  console.log(
    "📅 Scheduler ready — ingestion at 03:00 & 15:00 UTC, synthesis at 04:00 UTC (1 article/day)",
  );
}
