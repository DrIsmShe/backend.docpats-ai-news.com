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

// Ниже этой длины текст — не статья, а подпись под ссылкой: заголовок,
// служебная строка или пара предложений аннотации. Открывать такую карточку
// внутри сайта незачем, и обещать «читать полностью» — обман.
const FULL_TEXT_MIN = 500;

/**
 * Готовит материал для СПИСКА.
 *
 * Раньше список отдавал документ целиком, и ответ на 20 карточек весил 882 КБ:
 * туда уезжал полный текст (до 15 000 знаков), вектор embedding из 1536 чисел
 * и переводы на все пять языков — при том что в карточке видно 150 знаков.
 *
 * Здесь же считается hasFullText: по нему интерфейс честно показывает, что
 * откроется внутри сайта, а что уведёт к издателю. Треть материалов приходит
 * без текста, и раньше это выяснялось только после клика.
 */
function forList(article) {
  const { content, embedding, translations, ...rest } = article;

  return {
    ...rest,
    hasFullText: String(content || "").trim().length >= FULL_TEXT_MIN,
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
    // Порядок важен: сначала перевод (ему нужны translations), потом сборка
    // карточки, которая эти translations из ответа и убирает.
    items: items.map((a) => forList(applyTranslation(a, locale))),
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
      // content нужен, чтобы посчитать hasFullText, но в ответ он не уйдёт —
      // forList его срезает. doi и pmid добавлены: по ним из карточки можно
      // перейти к поиску доказательств, раньше эти поля не заполнялись вовсе.
      "title summary aiSummaryShort aiSummaryLong specialty specialties sourceName slug publishedAt importanceScore type canonicalUrl url translations content doi pmid imageUrl journal",
    )
    .lean();

  return items.map((a) => forList(applyTranslation(a, locale)));
}

async function getBySlug(slug, locale = "en") {
  const article = await News.findOne({ slug, status: "published" }).lean();
  if (!article) return null;
  return applyTranslation(article, locale);
}

// Представляемся честно, своим именем и адресом.
//
// Раньше здесь стоял поддельный Googlebot, и это не работало: CDC такие
// запросы отклоняет с 403 — подделка под поисковик прямо запрещена их
// правилами. В итоге 1709 материалов CDC из 1838 лежали в ленте вообще без
// текста, и «читать полностью» уводило к издателю.
//
// Проверено на живых источниках: с этой подписью CDC отдаёт 200 и около 4700
// знаков текста. Обычный браузерный User-Agent, кстати, тоже получает 403 —
// пропускают именно представившегося бота.
const USER_AGENT =
  "DocpatsBot/1.0 (+https://docpats.com; medical news aggregator)";

// Предел длины текста.
//
// Было 15 000 знаков, и это резало саму суть ленты: три четверти материалов
// (4346 из 5818) упирались в лимит, а научные статьи в PLOS, Frontiers и eLife
// идут по 30–60 тысяч. Живой пример — работа Frontiers о поражении суставов
// при псориатическом артрите: на странице 40 611 знаков, в базе лежало ровно
// 15 000, оборванных посреди слова «destructive-d».
//
// 120 000 покрывает даже длинные обзоры с списком литературы. Предел вообще
// нужен: он защищает от страницы-каталога, где «статьёй» окажется весь архив
// журнала.
const MAX_CONTENT = Number(process.env.NEWS_MAX_CONTENT || 120000);

/**
 * Обрезает текст по границе абзаца, а не посреди слова.
 *
 * Оборванное на полуслове предложение читается как ошибка сайта, а модель,
 * которой такой текст попадёт на перевод или в анализ, честно попытается
 * достроить смысл из обрубка.
 */
function limitText(text) {
  const value = String(text || "");
  if (value.length <= MAX_CONTENT) return value;

  const cut = value.slice(0, MAX_CONTENT);
  const lastBreak = cut.lastIndexOf("\n\n");
  // Возвращаемся к последнему целому абзацу, но только если он не в самом
  // начале: иначе от длинного текста без разбивки останется огрызок.
  return lastBreak > MAX_CONTENT * 0.5 ? cut.slice(0, lastBreak) : cut;
}

export async function extractFullContent(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 5,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
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
      content: limitText(text.trim()),
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
