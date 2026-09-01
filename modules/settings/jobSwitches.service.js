// modules/settings/jobSwitches.service.js
//
// Чтение и переключение фоновых задач.
//
// КЭШ НА НЕСКОЛЬКО СЕКУНД. Задачи спрашивают состояние перед каждым
// запуском, а некоторые из них — раз в тридцать минут; лишний запрос к
// базе тут не страшен. Но состояние спрашивает и перевод, который
// вызывается на каждую статью в цикле, и вот там запрос на каждую итерацию
// уже заметен. Несколько секунд жизни кэша решают обе задачи: переключение
// срабатывает практически сразу, а поток запросов не растёт.
//
// ПОЧЕМУ СБОЙ БАЗЫ НЕ ОСТАНАВЛИВАЕТ ЗАДАЧИ. Если состояние не прочиталось,
// считаем, что всё включено. Обратное поведение опаснее: недоступная на
// минуту база тихо остановила бы генерацию, и никто бы не понял, почему
// статьи перестали выходить.

import JobSwitch from "./jobSwitches.model.js";

export const JOBS = ["ingestion", "synthesis", "translation", "conferences"];

export const JOB_TITLES = {
  ingestion: "Сбор новостей",
  synthesis: "Генерация статей",
  translation: "Перевод статей",
  conferences: "Сбор конференций",
};

const CACHE_MS = 5000;
let cache = null;
let cachedAt = 0;

const allOn = () =>
  Object.fromEntries(JOBS.map((j) => [j, true]));

/** Текущее состояние всех переключателей. */
export async function getSwitches({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < CACHE_MS) return cache;

  try {
    const doc = await JobSwitch.findOneAndUpdate(
      { key: "jobs" },
      { $setOnInsert: { key: "jobs" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    cache = {
      ...allOn(),
      ...Object.fromEntries(JOBS.map((j) => [j, doc[j] !== false])),
      updatedBy: doc.updatedBy || null,
      lastChange: doc.lastChange || null,
      updatedAt: doc.updatedAt || null,
    };
    cachedAt = Date.now();
    return cache;
  } catch (err) {
    console.error("[jobSwitches] не удалось прочитать состояние:", err.message);
    // Неизвестное состояние означает «как было», а не «всё стоит».
    return { ...allOn(), updatedBy: null, lastChange: null, updatedAt: null };
  }
}

/**
 * Включена ли задача.
 *
 * Зовётся из cron перед каждым запуском. Никогда не бросает: упавшая
 * проверка не должна ронять расписание.
 */
export async function isEnabled(job) {
  const s = await getSwitches();
  return s[job] !== false;
}

/**
 * Переключить задачи.
 *
 * @param {object} patch  {synthesis: false, ...} — только известные задачи
 * @param {string} by     кто переключил, для записи в историю
 */
export async function setSwitches(patch, by = "admin") {
  const update = {};
  const changed = [];

  for (const job of JOBS) {
    if (typeof patch?.[job] !== "boolean") continue;
    update[job] = patch[job];
    changed.push(`${JOB_TITLES[job]}: ${patch[job] ? "вкл" : "выкл"}`);
  }

  if (!changed.length) {
    const err = new Error("не передано ни одной известной задачи");
    err.status = 400;
    throw err;
  }

  update.updatedBy = by;
  update.lastChange = changed.join(", ");

  const doc = await JobSwitch.findOneAndUpdate(
    { key: "jobs" },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  // Сбрасываем кэш сразу: переключатель должен срабатывать мгновенно, а
  // не через пять секунд, иначе владелец нажмёт второй раз.
  cache = null;
  cachedAt = 0;

  console.log(`[jobSwitches] ${by}: ${update.lastChange}`);
  return getSwitches({ fresh: true });
}
