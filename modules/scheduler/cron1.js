import cron from "node-cron";
import ingestionService from "../ingestion/ingestion.service.js";
import { runSynthesis } from "../synthesis/synthesis.service.js";

function startCronJobs() {
  // ── Полное отключение фоновых задач ───────────────────
  if (process.env.DISABLE_SCHEDULERS === "true") {
    console.log("⏸  Legacy scheduler DISABLED via DISABLE_SCHEDULERS=true");
    return;
  }

  console.log("Scheduler started");

  // Парсинг RSS — каждые 30 минут
  cron.schedule("*/30 * * * *", async () => {
    console.log("Running RSS ingestion...");
    try {
      const result = await ingestionService.runRSSIngestion();
      console.log("Inserted:", result.inserted);
    } catch (error) {
      console.error("Scheduler error:", error);
    }
  });

  // Синтез статей — 3 раза в день
  cron.schedule("0 8,14,20 * * *", async () => {
    console.log("[Synthesis] Запуск синтеза...");
    try {
      const result = await runSynthesis({ hoursBack: 7, maxGroups: 1 });
      console.log(
        "[Synthesis] Готово. Сгенерировано статей:",
        result.generated,
      );
    } catch (err) {
      console.error("[Synthesis] Ошибка:", err);
    }
  });
}

export { startCronJobs };
