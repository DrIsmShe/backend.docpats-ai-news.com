import Anthropic from "@anthropic-ai/sdk";
import Synthesis from "./synthesis.model.js";

const client = new Anthropic({ timeout: 120000, maxRetries: 2 });

const LANG_NAMES = {
  ru: "русском",
  en: "английском",
  az: "азербайджанском",
  ar: "арабском",
  tr: "турецком",
};

// ─── Надёжный парсер JSON-ответа от LLM ─────────────────────
// Покрывает: ```json ... ```, ``` ... ```, ведущие/завершающие пояснения,
// мусор до и после JSON-объекта.
function parseLlmJson(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty LLM response");
  }
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    // fallback: найти первый JSON-объект в строке
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in response");
    return JSON.parse(match[0]);
  }
}

async function generateSeoForLocale(title, body, locale) {
  const excerpt = body.slice(0, 1000);

  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Статья для врачей. Заголовок: "${title}". Начало: "${excerpt}"

Сгенерируй на ${LANG_NAMES[locale]} языке:
1. SEO-заголовок (до 60 символов, медицинский, информативный)
2. SEO-описание (до 155 символов, для врачей, без воды)

Ответь СТРОГО в формате JSON, без markdown, без пояснений, без \`\`\`:
{"title":"...","description":"..."}`,
      },
    ],
  });

  const text = msg?.content?.[0]?.text;
  const parsed = parseLlmJson(text);

  // Валидация и обрезка под лимиты
  const seoTitle = String(parsed.title || "").slice(0, 60);
  const seoDescription = String(parsed.description || "").slice(0, 155);

  if (!seoTitle || !seoDescription) {
    throw new Error(`Empty title or description for ${locale}`);
  }

  return { title: seoTitle, description: seoDescription };
}

export async function generateAllSeo(articleId, title, body) {
  const locales = ["ru", "en", "az", "ar", "tr"];
  const seo = {};

  for (const locale of locales) {
    try {
      seo[locale] = await generateSeoForLocale(title, body, locale);
    } catch (err) {
      console.error(`SEO gen failed for ${locale}:`, err.message);
      // fallback — обрезаем оригинал
      seo[locale] = {
        title: title.slice(0, 60),
        description: body
          .replace(/#+\s/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 155),
      };
    }
  }

  await Synthesis.findByIdAndUpdate(articleId, { seo });
  console.log(`✅ SEO сгенерирован для статьи ${articleId}`);
}
