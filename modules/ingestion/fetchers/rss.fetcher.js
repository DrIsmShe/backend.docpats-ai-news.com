import Parser from "rss-parser";

const parser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
  timeout: 15000,
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["enclosure", "enclosure"],
      ["itunes:image", "itunesImage"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

// 🔁 retry helper
async function fetchWithRetry(fn, retries = 2) {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return fetchWithRetry(fn, retries - 1);
  }
}

function extractImage(item) {
  if (item.mediaContent?.["$"]?.url) return item.mediaContent["$"].url;
  if (item.mediaThumbnail?.["$"]?.url) return item.mediaThumbnail["$"].url;
  if (item.enclosure?.url && item.enclosure?.type?.startsWith("image/")) {
    return item.enclosure.url;
  }
  if (item.itunesImage?.["$"]?.href) return item.itunesImage["$"].href;

  const html = item.contentEncoded || item.content || "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match) return match[1];

  return "";
}

async function fetchRSS(source) {
  try {
    const feed = await fetchWithRetry(() => parser.parseURL(source.baseUrl));

    if (!feed || !feed.items || feed.items.length === 0) {
      console.warn("⚠️ Empty RSS:", source.slug);
      return [];
    }

    const articles = feed.items
      .map((item) => {
        if (!item.link || !item.title) return null;

        return {
          externalId: item.guid || item.id || item.link,
          title: item.title || "",
          summary: item.contentSnippet || item.content || item.summary || "",
          canonicalUrl: item.link,
          imageUrl: extractImage(item),
          publishedAt: item.pubDate
            ? new Date(item.pubDate)
            : item.isoDate
              ? new Date(item.isoDate)
              : new Date(),
          authors: item.creator
            ? [item.creator]
            : item.author
              ? [item.author]
              : [],
          sourceName: source.name,
          sourceSlug: source.slug,
        };
      })
      .filter(Boolean);

    // 🧠 удаление дублей
    const unique = Array.from(
      new Map(articles.map((a) => [a.externalId, a])).values(),
    );

    return unique;
  } catch (error) {
    console.error("❌ RSS error:", source.slug, error.message);

    // 💡 помечаем источник как проблемный
    return [];
  }
}

export { fetchRSS };
