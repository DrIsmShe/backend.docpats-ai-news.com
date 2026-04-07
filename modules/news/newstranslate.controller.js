import News from "./news.model.js";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";
import redis from "../../config/redis.js";

const LOCALE_NAMES = {
  ru: "Russian",
  az: "Azerbaijani",
  ar: "Arabic",
  tr: "Turkish",
  zh: "Chinese (Simplified)",
};

let openai;
function getOpenAI() {
  if (!openai) {
    const config = { apiKey: process.env.OPENAI_API_KEY };
    if (process.env.HTTPS_PROXY) {
      config.httpAgent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
    }
    openai = new OpenAI(config);
  }
  return openai;
}

export async function translateContent(req, res) {
  const { locale } = req.body;
  const { slug } = req.params;

  if (!locale || locale === "en") {
    return res.status(400).json({ error: "Invalid locale" });
  }

  if (!LOCALE_NAMES[locale]) {
    return res.status(400).json({ error: "Unsupported locale" });
  }

  try {
    // 1. Проверяем Redis
    const cacheKey = `translation:${slug}:${locale}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`✅ Redis cache HIT: ${cacheKey}`);
      return res.json({ translated: cached });
    }
    console.log(`❌ Redis cache MISS: ${cacheKey}`);

    // 2. Проверяем MongoDB
    const article = await News.findOne({ slug, status: "published" }).lean();
    if (!article || !article.content) {
      return res.status(404).json({ error: "No content" });
    }

    if (article.translations?.[locale]?.content?.trim()) {
      const content = article.translations[locale].content;
      console.log(`✅ MongoDB cache HIT: ${cacheKey}`);
      await redis.setex(cacheKey, 86400, content);
      return res.json({ translated: content });
    }

    // 3. Переводим через OpenAI
    console.log(`🤖 Translating via OpenAI: ${cacheKey}`);
    const client = getOpenAI();
    const result = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Translate this medical article text to ${LOCALE_NAMES[locale]}. Return only the translated text, preserve paragraph breaks:\n\n${article.content.slice(0, 8000)}`,
        },
      ],
      temperature: 0.2,
    });

    const translated = result.choices[0].message.content;

    // 4. Сохраняем в Redis и MongoDB
    await redis.setex(cacheKey, 86400, translated);
    await News.findOneAndUpdate(
      { slug },
      { $set: { [`translations.${locale}.content`]: translated } },
    );
    console.log(`💾 Saved to Redis + MongoDB: ${cacheKey}`);

    res.json({ translated });
  } catch (err) {
    console.error("translateContent error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
