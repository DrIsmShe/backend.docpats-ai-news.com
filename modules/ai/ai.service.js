import OpenAI from "openai";

let client = null;

if (process.env.OPENAI_API_KEY) {
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function cleanJSON(text = "") {
  return text.replace(/```json|```/g, "").trim();
}

function safeText(str = "", max = 2000) {
  return str.slice(0, max);
}

function normalizeSpecialty(value) {
  if (!value) return "general";

  const map = {
    oncology: "oncology",
    cancer: "oncology",

    cardiology: "cardiology",
    heart: "cardiology",

    neurology: "neurology",
    neuro: "neurology",

    infectious: "infectious",
    infection: "infectious",
    virus: "infectious",
  };

  const key = value.toLowerCase();

  return map[key] || "general";
}

export async function analyzeArticle(article) {
  const title = safeText(article.title || "", 500);
  const summary = safeText(article.summary || "", 1500);

  /**
   * Если нет API ключа — работаем без AI
   */

  if (!client) {
    return {
      summary,
      specialty: "general",
      importanceScore: 50,
    };
  }

  const prompt = `
You are a medical research editor.

Return ONLY valid JSON.

{
"summary": "short medical news summary",
"specialty": "medical specialty",
"importanceScore": number 0-100
}

Title:
${title}

Text:
${summary}
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

    if (!raw) {
      throw new Error("Empty AI response");
    }

    const cleaned = cleanJSON(raw);

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Invalid JSON from AI");
    }

    return {
      summary: parsed.summary || summary,
      specialty: normalizeSpecialty(parsed.specialty),
      importanceScore:
        typeof parsed.importanceScore === "number"
          ? parsed.importanceScore
          : 50,
    };
  } catch (error) {
    console.error("AI analyze error:", error.message);

    return {
      summary,
      specialty: "general",
      importanceScore: 50,
    };
  }
}
