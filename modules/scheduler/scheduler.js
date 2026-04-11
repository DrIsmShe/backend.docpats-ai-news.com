// modules/scheduler/scheduler.js

import cron from "node-cron";
import { runIngestion } from "../ingestion/ingestion.service.js";
import { seedSourcesIfEmpty } from "../sources/source.service.js";
import { runSynthesis } from "../synthesis/synthesis.service.js";

export async function startScheduler() {
  console.log("📅 Scheduler initializing...");

  // 1. Синхронизируем источники
  try {
    const seedResult = await seedSourcesIfEmpty();
    console.log("✅ Sources synced:", seedResult);
  } catch (err) {
    console.error("❌ Seed error:", err.message);
  }

  // 2. Запускаем ingestion сразу при старте
  try {
    console.log("🔄 Running initial ingestion...");
    const result = await runIngestion();
    console.log(
      `✅ Initial ingestion done: inserted=${result.inserted}, skipped=${result.skipped}`,
    );
  } catch (err) {
    console.error("❌ Initial ingestion error:", err.message);
  }

  // 3. Ingestion каждые 30 минут
  cron.schedule("*/30 * * * *", async () => {
    console.log("⏰ Scheduled ingestion starting...");
    try {
      const result = await runIngestion();
      console.log(`✅ Scheduled ingestion done: inserted=${result.inserted}`);
    } catch (error) {
      console.error("❌ Scheduler ingestion error:", error.message);
    }
  });

  // 4. Синтез каждый день в 04:00
  // hoursBack=72 — берём новости за 3 дня, чтобы всегда был материал
  cron.schedule("0 4 * * *", async () => {
    console.log("🧠 Synthesis cron starting...");
    try {
      const result = await runSynthesis({ hoursBack: 72, maxGroups: 3 });
      console.log(`✅ Synthesis done: generated=${result.generated}`);
    } catch (error) {
      console.error("❌ Synthesis cron error:", error.message);
    }
  });

  console.log(
    "📅 Scheduler ready — ingestion every 30 min, synthesis at 04:00",
  );
}
