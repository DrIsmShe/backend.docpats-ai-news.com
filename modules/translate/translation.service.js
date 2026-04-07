import OpenAI from "openai";
import News from "../news/news.model.js";
import { HttpsProxyAgent } from "https-proxy-agent";

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

const LOCALES = ["ru", "az", "ar", "tr", "zh"];

const LOCALE_NAMES = {
  ru: "Russian",
  az: "Azerbaijani",
  ar: "Arabic",
  tr: "Turkish",
  zh: "Chinese (Simplified)",
};

export async function translateArticle(newsId) {
  const article = await News.findById(newsId);
  if (!article) return;

  const client = getOpenAI();
  const translations = {};

  for (const locale of LOCALES) {
    try {
      const prompt = `You are a professional medical translator.
Translate the following fields from English to ${LOCALE_NAMES[locale]}.
Respond ONLY with a valid JSON object with these keys: title, summary, aiSummaryShort, aiSummaryLong.
Keep medical terminology accurate. Do not add explanations.

title: ${article.title}
summary: ${article.summary}
aiSummaryShort: ${article.aiSummaryShort}
aiSummaryLong: ${article.aiSummaryLong || ""}`;

      const res = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const parsed = JSON.parse(res.choices[0].message.content);
      translations[locale] = parsed;
    } catch (err) {
      console.error(`Translation error [${locale}]:`, err.message);
      translations[locale] = {
        title: article.title,
        summary: article.summary,
        aiSummaryShort: article.aiSummaryShort,
        aiSummaryLong: article.aiSummaryLong,
      };
    }
  }

  await News.findByIdAndUpdate(newsId, {
    translations,
    translationStatus: "done",
  });
}
