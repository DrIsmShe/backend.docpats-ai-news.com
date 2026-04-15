import Anthropic from "@anthropic-ai/sdk";
import Synthesis from "./synthesis.model.js";
const client = new Anthropic({ timeout: 60000 });

const LANG_NAMES = {
  ru: "русском",
  en: "английском",
  az: "азербайджанском",
  ar: "арабском",
  tr: "турецком",
};

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

Ответь ТОЛЬКО в JSON без markdown:
{"title":"...","description":"..."}`,
      },
    ],
  });

  const text = msg.content[0].text.trim();
  const clean = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(clean);
}

export async function generateAllSeo(articleId, title, body) {
  const locales = ["ru", "en", "az", "ar", "tr"];
  const seo = {};

  for (const locale of locales) {
    try {
      seo[locale] = await generateSeoForLocale(title, body, locale);
    } catch (err) {
      // fallback — обрезаем оригинал
      console.error(`SEO gen failed for ${locale}:`, err.message);
      seo[locale] = {
        title: title.slice(0, 60),
        description: body.replace(/#+\s/g, "").slice(0, 155),
      };
    }
  }
  await Synthesis.findByIdAndUpdate(articleId, { seo });
  console.log(`✅ SEO сгенерирован для статьи ${articleId}`);
}
