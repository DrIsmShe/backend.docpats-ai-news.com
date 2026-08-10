// utils/redisLock.js
// Распределённая блокировка на Redis для операций, которые нельзя запускать
// параллельно: генерация статьи стоит денег, и два одновременных запуска
// означают двойной счёт и две статьи на одну тему.
//
// Почему не переменная в памяти процесса: она живёт внутри одного инстанса.
// При нескольких процессах PM2 каждый имеет собственную копию флага и ничего
// не знает о соседях, а после рестарта флаг сбрасывается на середине работы.

import crypto from "node:crypto";
import redis from "../config/redis.js";

// Снимать блокировку имеет право только тот, кто её поставил: сравниваем
// токен перед удалением. Без этой проверки процесс, чей лок уже истёк по TTL,
// удалил бы чужой лок, взятый следующим процессом.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`;

// Клиент создан с maxRetriesPerRequest: null — при недоступном Redis команда
// не падает, а бесконечно ждёт переподключения. Без этого ограничителя запрос
// к API повис бы навсегда вместо того, чтобы выполнить работу без блокировки.
const REDIS_OP_TIMEOUT_MS = 3000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: Redis не ответил за ${ms}ms`)),
      ms,
    );
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Выполняет fn под блокировкой.
 *
 * @param {string} key    ключ блокировки, например "lock:synthesis:run"
 * @param {number} ttlMs  срок жизни лока; продлевается автоматически, пока fn работает
 * @param {Function} fn   что выполнить, если лок взят
 * @returns {Promise<{acquired: boolean, result?: any}>}
 *          acquired=false означает, что операция уже выполняется где-то ещё
 */
export async function withLock(key, ttlMs, fn) {
  const token = crypto.randomUUID();
  let held = false;

  try {
    const res = await withTimeout(
      redis.set(key, token, "PX", ttlMs, "NX"),
      REDIS_OP_TIMEOUT_MS,
      `acquire ${key}`,
    );
    if (res !== "OK") {
      return { acquired: false };
    }
    held = true;
  } catch (err) {
    // Redis лежит. Отказ выполнять работу означал бы, что падение Redis
    // останавливает суточный синтез, — это дороже, чем маловероятный двойной
    // запуск. Работаем без блокировки, но громко пишем об этом в лог.
    console.error(
      `[lock] Redis недоступен (${err.message}) — "${key}" выполняется БЕЗ блокировки`,
    );
  }

  // Пока fn работает, продлеваем TTL: генерация с ретраями может идти дольше
  // изначального срока, и лок не должен истечь под работающей задачей.
  let renewTimer = null;
  if (held) {
    renewTimer = setInterval(() => {
      withTimeout(
        redis.eval(RENEW_SCRIPT, 1, key, token, String(ttlMs)),
        REDIS_OP_TIMEOUT_MS,
        `renew ${key}`,
      ).catch((err) =>
        console.error(`[lock] Не удалось продлить "${key}": ${err.message}`),
      );
    }, Math.floor(ttlMs / 3));
    // Таймер не должен удерживать процесс от завершения.
    renewTimer.unref?.();
  }

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    if (renewTimer) clearInterval(renewTimer);
    if (held) {
      try {
        await withTimeout(
          redis.eval(RELEASE_SCRIPT, 1, key, token),
          REDIS_OP_TIMEOUT_MS,
          `release ${key}`,
        );
      } catch (err) {
        console.error(
          `[lock] Не удалось снять "${key}": ${err.message} (истечёт по TTL)`,
        );
      }
    }
  }
}

// Ключи блокировок в одном месте, чтобы ручной запуск и cron гарантированно
// использовали одну и ту же строку.
export const LOCK_KEYS = {
  synthesis: "lock:synthesis:run",
};

export default withLock;
