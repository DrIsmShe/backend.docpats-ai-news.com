import News from "./news.model.js";
import axios from "axios";
import * as cheerio from "cheerio";

function applyTranslation(article, locale) {
  if (!locale || locale === "en") return article;
  const t = article.translations?.[locale];
  if (!t) return article;
  return {
    ...article,
    title: t.title || article.title,
    summary: t.summary || article.summary,
    aiSummaryShort: t.aiSummaryShort || article.aiSummaryShort,
    aiSummaryLong: t.aiSummaryLong || article.aiSummaryLong,
  };
}

async function getLatestNews({
  limit = 20,
  page = 1,
  type = "",
  specialty = "",
  locale = "en",
}) {
  const query = {
    status: "published",
    isDuplicate: false,
  };

  if (type && type !== "all") {
    query.type = type;
  }

  if (specialty && specialty !== "all") {
    const specRegex = new RegExp(`^${specialty}$`, "i");
    query.$or = [{ specialty: specRegex }, { specialties: specRegex }];
  }

  const skip = (page - 1) * limit;

  const items = await News.find(query)
    .sort({ publishedAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await News.countDocuments(query);

  return {
    items: items.map((a) => applyTranslation(a, locale)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

async function getFeed(limit = 20, locale = "en") {
  const items = await News.find({
    status: "published",
    isDuplicate: false,
  })
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(limit)
    .select(
      "title summary aiSummaryShort aiSummaryLong specialty specialties sourceName slug publishedAt importanceScore type canonicalUrl url translations",
    )
    .lean();

  return items.map((a) => applyTranslation(a, locale));
}

async function getBySlug(slug, locale = "en") {
  const article = await News.findOne({ slug, status: "published" }).lean();
  if (!article) return null;
  return applyTranslation(article, locale);
}

export async function extractFullContent(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
    });

    const $ = cheerio.load(res.data);
    $("script, style, nav, footer, header, aside").remove();

    const baseUrl = new URL(url).origin;

    let image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $("article img, main img, .content img").first().attr("src") ||
      "";

    if (image && image.startsWith("/")) {
      image = baseUrl + image;
    }

    let text = "";
    $("article p, main p, .content p, p").each((i, el) => {
      const t = $(el).text().trim();
      if (t.length > 40) text += t + "\n\n";
    });

    return {
      content: text.trim().slice(0, 15000),
      image,
    };
  } catch (err) {
    console.error("Parse error:", err.message);
    return { content: "", image: "" };
  }
}

export { getFeed, getBySlug };

const newsService = { getLatestNews };
export default newsService;
