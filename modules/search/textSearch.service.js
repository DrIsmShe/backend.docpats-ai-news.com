// modules/search/textSearch.service.js
//
// Поиск по архиву медицинских материалов.
//
// ПОЧЕМУ НЕ ПРЕЖНИЙ semanticSearch. Тот брал ПОСЛЕДНИЕ 200 материалов из
// пяти с половиной тысяч, считал вектор запроса через платный API и сравнивал
// всё в памяти процесса. То есть искал по трём процентам архива, стоил денег
// на каждый запрос и не умел ни фильтров, ни страниц. Вдобавок его роут не был
// смонтирован в app.js — /api/search отвечал 404, а поле поиска на странице
// было закомментировано, поэтому поломку никто не видел.
//
// Здесь обычный текстовый индекс MongoDB: ищет по всему архиву, работает без
// внешних вызовов и умеет то, чего ждут от поиска, — фильтры и страницы.
//
// ЯЗЫК. Материалы приходят на английском, а врач ищет и по-русски тоже.
// Поэтому индекс включает и переводы (translations.<lang>.title/summary), а
// default_language: "none" отключает стемминг: английский стеммер, применённый
// к русскому слову, отрезал бы от него куски и портил совпадения.

import News from "../news/news.model.js";

const LOCALES = ["ru", "en", "az", "tr", "ar"];

/**
 * Поля, по которым ищем.
 *
 * Полный текст (content) НЕ индексируется намеренно: это 33 тысячи знаков на
 * материал, индекс раздулся бы до размеров самой коллекции, а выдача
 * наполнилась бы работами, где слово встретилось один раз в списке
 * литературы. Заголовок и краткое содержание отвечают на вопрос «о чём это»
 * куда точнее.
 */
function indexSpec() {
  const spec = {
    title: "text",
    summary: "text",
    aiSummaryShort: "text",
  };
  for (const lang of LOCALES) {
    spec[`translations.${lang}.title`] = "text";
    spec[`translations.${lang}.summary`] = "text";
  }
  return spec;
}

// Вес заголовка выше: совпадение в названии почти всегда значит, что материал
// про это, а совпадение в аннотации — что там оно упомянуто.
function indexWeights() {
  const weights = { title: 10, summary: 3, aiSummaryShort: 3 };
  for (const lang of LOCALES) {
    weights[`translations.${lang}.title`] = 10;
    weights[`translations.${lang}.summary`] = 3;
  }
  return weights;
}

let indexReady = null;

/**
 * Создаёт текстовый индекс, если его ещё нет.
 *
 * Лениво и один раз за жизнь процесса: коллекция большая, а построение идёт
 * минуты — делать это на старте значило бы задерживать запуск сервера.
 */
export async function ensureSearchIndex() {
  if (indexReady) return indexReady;

  indexReady = (async () => {
    const existing = await News.collection.indexes();
    if (existing.some((i) => i.name === "news_text_search")) return true;

    console.log("🔍 Building text search index (это займёт пару минут)…");
    await News.collection.createIndex(indexSpec(), {
      name: "news_text_search",
      weights: indexWeights(),
      default_language: "none",

      // ЭТО ОБЯЗАТЕЛЬНО, и вот почему. В документах есть поле language ("en"),
      // и MongoDB по умолчанию считает его языком документа — то есть при
      // индексации применяет английский стеммер. Тогда «arthritis» ложится в
      // индекс как «arthriti», а запрос, обработанный без стемминга
      // (default_language: "none"), ищет «arthritis» и не находит ничего.
      //
      // Проверено на живой базе: 70 материалов содержали «arthritis» в
      // заголовке, а поиск возвращал ноль. «metformin» при этом находился —
      // его стеммер не меняет, и поломка выглядела как случайная.
      //
      // Указываем несуществующее поле: тогда язык документа взять неоткуда, и
      // и индексация, и поиск идут одинаково — без стемминга.
      language_override: "textSearchLanguage",

      background: true,
    });
    console.log("✅ Text search index ready");
    return true;
  })().catch((err) => {
    // Индекс не построился — поиск ответит понятной ошибкой, но сервер жив.
    console.error("❌ Search index error:", err.message);
    indexReady = null;
    return false;
  });

  return indexReady;
}

/**
 * Поиск по архиву.
 *
 * @param {object} args
 * @param {string} args.query
 * @param {string} [args.specialty] раздел («oncology»), «all» или пусто — везде
 * @param {string} [args.type]      news | research
 * @param {number} [args.page]
 * @param {number} [args.limit]
 * @param {string} [args.locale]    язык, на котором показать найденное
 * @returns {Promise<{items: Array, total: number, page: number, totalPages: number}>}
 */
export async function searchArchive({
  query,
  specialty = "",
  type = "",
  page = 1,
  limit = 20,
  locale = "en",
} = {}) {
  const clean = String(query || "").trim();
  if (clean.length < 2) {
    return { items: [], total: 0, page: 1, totalPages: 0, query: clean };
  }

  await ensureSearchIndex();

  const words = clean.split(/\s+/).filter(Boolean);

  // ПОЧЕМУ СНАЧАЛА ФРАЗА, А ПОТОМ СЛОВА.
  //
  // $text ищет по ИЛИ: любое слово из запроса. Человек, вставивший в поиск
  // заголовок статьи, получает не эту статью, а всё, где встретилось
  // «between», «patients» или «association». Живой пример: заголовок из
  // семнадцати слов дал 5580 совпадений — почти весь архив, и нужной работы
  // не было даже в первой пятёрке.
  //
  // Сортировка по релевантности не спасает: textScore считает ЧАСТОТУ слов,
  // поэтому наверх выходит документ, где «association» повторено десять раз,
  // а не тот, где совпал весь заголовок целиком.
  //
  // Поэтому длинный запрос сперва пробуем как точную фразу — в кавычках
  // MongoDB ищет подряд идущие слова. Тот же заголовок так находит ровно одну
  // работу, ту самую. Не нашлось — ищем обычным ИЛИ, как и раньше: короткие
  // запросы вроде «метформин диабет» должны работать по словам.
  const asPhrase = words.length >= 3 ? `"${clean.replace(/"/g, "")}"` : null;

  if (asPhrase) {
    const exact = await runSearch({
      search: asPhrase,
      specialty,
      type,
      page,
      limit,
      locale,
      clean,
    });
    if (exact.total > 0) return { ...exact, matched: "phrase" };
  }

  return {
    ...(await runSearch({
      search: clean,
      specialty,
      type,
      page,
      limit,
      locale,
      clean,
    })),
    matched: "words",
  };
}

async function runSearch({
  search,
  specialty,
  type,
  page,
  limit,
  locale,
  clean,
}) {
  const filter = {
    status: "published",
    isDuplicate: false,
    $text: { $search: search },
  };

  if (specialty && specialty !== "all") {
    filter.$or = [{ specialty }, { specialties: specialty }];
  }
  if (type && type !== "all") {
    filter.type = type;
  }

  const skip = (Math.max(1, page) - 1) * limit;

  // score — насколько совпадение сильное. Сортируем по нему, а не по дате:
  // в поиске человек ищет подходящее, а не свежее.
  const [items, total] = await Promise.all([
    News.find(filter, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" }, publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "title summary aiSummaryShort specialty specialties sourceName slug publishedAt type canonicalUrl doi pmid translations content",
      )
      .lean(),
    News.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => localize(item, locale)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    query: clean,
  };
}

/** Тот же приём, что и в ленте: перевод поверх оригинала, тяжёлое — прочь. */
function localize(item, locale) {
  const t = locale && locale !== "en" ? item.translations?.[locale] : null;
  const { content, translations, ...rest } = item;

  return {
    ...rest,
    title: t?.title || item.title,
    summary: t?.summary || item.summary,
    aiSummaryShort: t?.aiSummaryShort || item.aiSummaryShort,
    hasFullText: String(content || "").trim().length >= 500,
  };
}

export default { searchArchive, ensureSearchIndex };
