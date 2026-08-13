// modules/search/search.controller.js
//
// Поиск по архиву материалов. Прежняя версия звала semanticSearch, который
// смотрел лишь последние 200 записей и считал вектор запроса за деньги;
// вдобавок роут не был смонтирован, и /api/search отвечал 404. Теперь это
// обычный текстовый поиск по всему архиву — см. textSearch.service.js.

import { searchArchive } from "./textSearch.service.js";

function getLocale(req) {
  return (
    req.query.locale ||
    req.headers["x-language"] ||
    req.headers["accept-language"]?.slice(0, 2) ||
    "en"
  );
}

async function search(req, res) {
  const query = String(req.query.q || "").trim();

  if (query.length < 2) {
    return res.status(400).json({
      success: false,
      message: "Запрос слишком короткий — минимум 2 символа",
    });
  }

  try {
    const result = await searchArchive({
      query,
      specialty: req.query.specialty || "",
      type: req.query.type || "",
      page: Number(req.query.page || 1),
      // Потолок жёсткий: параметр приходит из браузера, и без него одним
      // запросом можно вытащить весь архив.
      limit: Math.min(Number(req.query.limit || 20), 50),
      locale: getLocale(req),
    });

    // Форма ответа совпадает с /api/news — интерфейс разбирает их одинаково.
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Search error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

export { search };
