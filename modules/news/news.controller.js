import newsService, { getFeed, getBySlug } from "./news.service.js";

function getLocale(req) {
  return (
    req.query.locale || req.headers["accept-language"]?.slice(0, 2) || "en"
  );
}

async function getLatestNews(req, res) {
  try {
    const limit = Number(req.query.limit || 20);
    const page = Number(req.query.page || 1);
    const type = req.query.type || "";
    const specialty = req.query.specialty || "";
    const locale = getLocale(req);

    const result = await newsService.getLatestNews({
      limit,
      page,
      type,
      specialty,
      locale,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch news",
      error: error.message,
    });
  }
}

async function feed(req, res) {
  try {
    const limit = Number(req.query.limit || 20);
    const locale = getLocale(req);
    const items = await getFeed(limit, locale);

    res.json({ success: true, count: items.length, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function article(req, res) {
  try {
    const locale = getLocale(req);
    const item = await getBySlug(req.params.slug, locale);

    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Article not found" });
    }

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export { getLatestNews, feed, article };
