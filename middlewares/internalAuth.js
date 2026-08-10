// middlewares/internalAuth.js
// Защита эндпоинтов, каждый вызов которых стоит денег (генерация статьи,
// перевод, полный обход источников). Без неё любой, кто знает адрес сервиса,
// может запускать их в цикле.
//
// Токен передаётся заголовком:
//   x-internal-token: <токен>
// либо
//   Authorization: Bearer <токен>

import crypto from "node:crypto";

// Сравнение за постоянное время — чтобы по времени ответа нельзя было
// подобрать токен посимвольно.
function safeEqual(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function extractToken(req) {
  const header = req.get("x-internal-token");
  if (header) return header.trim();

  const auth = req.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return null;
}

export function requireInternalToken(req, res, next) {
  const expected = process.env.INTERNAL_API_TOKEN;

  // Переменная не задана — закрываемся, а не открываемся. Cron-задачи вызывают
  // сервисы напрямую и от этого не зависят, так что отказ здесь безопаснее,
  // чем случайно оставленный открытым платный эндпоинт.
  if (!expected) {
    console.error(
      "[internalAuth] INTERNAL_API_TOKEN не задан — запрос к %s отклонён",
      req.originalUrl,
    );
    return res.status(503).json({
      success: false,
      message: "Service misconfigured: INTERNAL_API_TOKEN is not set",
    });
  }

  const provided = extractToken(req);

  if (!provided || !safeEqual(provided, expected)) {
    console.warn(
      "[internalAuth] Отклонён запрос к %s (ip=%s)",
      req.originalUrl,
      req.ip,
    );
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  return next();
}

export default requireInternalToken;
