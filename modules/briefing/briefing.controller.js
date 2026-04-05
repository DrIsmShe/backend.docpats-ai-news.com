import {
  generateDailyBriefing,
  getLatestBriefing,
} from "./briefing.service.js";

async function generate(req, res) {
  const briefing = await generateDailyBriefing();

  res.json({
    success: true,
    data: briefing,
  });
}

async function latest(req, res) {
  const briefing = await getLatestBriefing();

  res.json({
    success: true,
    data: briefing,
  });
}

export { generate, latest };
