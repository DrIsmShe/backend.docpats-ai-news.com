import OpenAI from "openai";

import Cluster from "../clustering/cluster.model.js";
import Briefing from "./briefing.model.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanJSON(text = "") {
  return text.replace(/```json|```/g, "").trim();
}

export async function generateDailyBriefing() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exists = await Briefing.findOne({ date: today });

  if (exists) return exists;

  const clusters = await Cluster.find()
    .sort({ trendScore: -1, articleCount: -1 })
    .limit(10);

  if (!clusters.length) return null;

  const clusterText = clusters
    .map((c, i) => {
      return `
Topic ${i + 1}:
Title: ${c.title}
Summary: ${c.summary}
Specialty: ${c.specialty}
Articles: ${c.articleCount}
`;
    })
    .join("\n");

  const prompt = `
You are a medical research editor.

Create a daily medical briefing from these topics.

Return ONLY JSON:

{
"title": "Daily Medical Briefing",
"summary": "short overview of today's developments",
"items": [
{
"title": "topic title",
"summary": "short explanation",
"specialty": "medical specialty"
}
]
}

Topics:
${clusterText}
`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = response.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(cleanJSON(raw));

    const briefing = await Briefing.create({
      date: today,
      title: parsed.title || "Daily Medical Briefing",
      summary: parsed.summary || "",
      items: parsed.items || [],
    });

    return briefing;
  } catch (error) {
    console.error("Briefing generation error:", error.message);
    return null;
  }
}

export async function getLatestBriefing() {
  return Briefing.findOne().sort({ date: -1 });
}
