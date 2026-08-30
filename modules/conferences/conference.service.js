import crypto from "node:crypto";
import Conference from "./conference.model.js";

// Четырнадцать корзин — не выдумка, а ровно те категории, по которым уже
// разложены 102 специальности в справочнике врачей
// (server/common/models/DoctorProfile/specialityOfDoctor.js, поле category).
// Держим коды, а не человеческие названия: в справочнике «Women’s Health»
// написано через типографский апостроф U+2019, и сравнивать строки из двух
// репозиториев по такому ключу — способ однажды потерять половину выборки.
export const CATEGORY_CODES = [
  "therapeutic",
  "surgical",
  "diagnostics",
  "rehabilitation",
  "dentistry",
  "womens-health",
  "pediatrics",
  "mental-health",
  "ophthalmology-ent",
  "sports-medicine",
  "oncology",
  "emergency",
  "mens-health",
  "pharmacy",
];

const CATEGORY_SET = new Set(CATEGORY_CODES);

export function normalizeCategories(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    const code = String(raw || "").trim().toLowerCase();
    if (CATEGORY_SET.has(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

// Название без регистра, пунктуации и порядковых номеров: «32nd European
// Congress of Cardiology» и «European Congress of Cardiology 2026» — одно
// мероприятие, и в базе оно должно быть одно.
function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\b\d+(st|nd|rd|th)\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Хеш по названию + году начала, а не по URL: у одного конгресса на пяти
// источниках пять разных URL, и дедуп по ним не сработал бы вообще.
export function makeContentHash(title, startDate) {
  const year = startDate ? new Date(startDate).getUTCFullYear() : "0";
  return crypto
    .createHash("sha256")
    .update(`${normalizeTitle(title)}|${year}`)
    .digest("hex");
}

export function makeSlug(title, startDate) {
  const year = startDate ? new Date(startDate).getUTCFullYear() : "";
  const base = normalizeTitle(title).replace(/\s+/g, "-").slice(0, 80);
  const suffix = crypto.randomBytes(3).toString("hex");
  return [base, year, suffix].filter(Boolean).join("-");
}

/**
 * Накладываем перевод на карточку.
 *
 * Переводим только то, что человек читает. Даты, город, стоимость и ссылка
 * остаются как есть: «перевод» факта — это способ его испортить. Пустое поле
 * перевода тоже игнорируем — лучше английский оригинал, чем пустая строка.
 */
export function applyTranslation(doc, lang) {
  if (!doc || !lang || lang === "en") return doc;
  const t = doc.translations?.[lang];
  if (!t) return doc;

  const out = { ...doc };
  for (const field of ["title", "description", "audience", "conditions"]) {
    if (t[field]) out[field] = t[field];
  }
  if (Array.isArray(t.program) && t.program.length) out.program = t.program;
  return out;
}

/**
 * Витрина. Показывает только опубликованное и только то, что ещё не прошло.
 *
 * По умолчанию сортируем по ближайшему дедлайну, а не по дате начала:
 * начало пропустить нельзя, а дедлайн регистрации — запросто, и ради него
 * на страницу возвращаются.
 */
export async function listConferences({
  categories = [],
  country = "",
  format = "",
  from = new Date(),
  sort = "deadline",
  page = 1,
  limit = 20,
  lang = "",
} = {}) {
  const cats = normalizeCategories(categories);

  const query = {
    status: "published",
    // Отсекаем прошедшее по дате ОКОНЧАНИЯ: трёхдневный конгресс на второй
    // день всё ещё идёт, и убирать его из списка рано.
    $or: [{ endDate: { $gte: from } }, { endDate: null, startDate: { $gte: from } }],
  };
  if (cats.length) query.categories = { $in: cats };
  if (country) query.country = country;
  if (format) query.format = format;

  const sortSpec =
    sort === "date"
      ? { startDate: 1 }
      : sort === "recent"
        ? { createdAt: -1 }
        : { registrationDeadline: 1, startDate: 1 };

  const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * perPage;

  const [items, total] = await Promise.all([
    Conference.find(query).sort(sortSpec).skip(skip).limit(perPage).lean(),
    Conference.countDocuments(query),
  ]);

  return {
    items: items.map((doc) => applyTranslation(doc, lang)),
    total,
    page: Math.max(Number(page) || 1, 1),
    limit: perPage,
  };
}

export async function getConferenceBySlug(slug, lang = "") {
  const doc = await Conference.findOne({
    slug: String(slug || "").toLowerCase(),
    status: "published",
  }).lean();
  return applyTranslation(doc, lang);
}

/**
 * Очередь модерации. По умолчанию — то, что ИИ нашёл, а человек ещё не
 * смотрел; но экрану нужны и уже опубликованные (снять с публикации), и
 * отклонённые (решение могло быть ошибочным — карточки не удаляются).
 */
export async function listDrafts({ limit = 50, status = "draft" } = {}) {
  const now = new Date();

  // Отдельный список: карточки, у которых даты нет вовсе. Их не опубликовать
  // (витрина отбирает по датам), и в общей очереди они теряются среди
  // готовых. Показываем их отдельно, чтобы было видно, сколько работы
  // осталось руками.
  if (status === "no-date") {
    return Conference.find({ startDate: null, status: { $ne: "rejected" } })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();
  }

  const filter = ["draft", "published", "rejected"].includes(status)
    ? { status }
    : {};
  // Прошедшее в очередь не показываем: опубликовать его нельзя, а внимание
  // модератора оно отнимает наравне с настоящей работой. А вот карточки БЕЗ
  // дат показываем обязательно — именно они и ждут, чтобы дату вписали.
  filter.$or = [
    { endDate: { $gte: now } },
    { endDate: null, startDate: { $gte: now } },
    { startDate: null, endDate: null },
  ];
  return Conference.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean();
}

/**
 * Проверки, которые модель не заменяет. Она пишет правдоподобное, а не
 * верное: дата прошлогоднего конгресса выглядит как дата будущего ровно
 * так же. Всё, что здесь не сошлось, не выбрасываем — помечаем и отдаём
 * человеку, чтобы он смотрел в конкретное поле, а не перепроверял карточку.
 */
export function validateDraft(payload, { trustedDomains = [] } = {}) {
  const flags = [];
  const now = new Date();

  if (!payload.title || String(payload.title).trim().length < 5) flags.push("no_title");
  if (!payload.startDate) flags.push("no_start_date");
  else if (new Date(payload.startDate) < now) flags.push("date_in_past");

  if (payload.endDate && payload.startDate && new Date(payload.endDate) < new Date(payload.startDate)) {
    flags.push("end_before_start");
  }
  if (payload.registrationDeadline && payload.startDate &&
      new Date(payload.registrationDeadline) > new Date(payload.startDate)) {
    flags.push("deadline_after_start");
  }

  if (!payload.organizer) flags.push("no_organizer");

  try {
    const host = new URL(payload.url).hostname.replace(/^www\./, "");
    if (trustedDomains.length && !trustedDomains.includes(host)) flags.push("untrusted_domain");
  } catch {
    flags.push("bad_url");
  }

  return flags;
}

/**
 * Черновик из ингестии. Повторная находка того же мероприятия не создаёт
 * дубль и НЕ перетирает то, что уже проверил человек: у опубликованной
 * карточки обновляем только поля, которые могли измениться на сайте
 * организатора (даты и дедлайны переносят постоянно).
 */
export async function upsertDraft(payload, options = {}) {
  const contentHash = makeContentHash(payload.title, payload.startDate);
  const existing = await Conference.findOne({ contentHash });

  if (existing) {
    const patch = {};
    for (const field of ["startDate", "endDate", "registrationDeadline", "abstractDeadline"]) {
      if (!payload[field]) continue;
      // Сравниваем метки времени, а не строки: в базе лежит Date, а из
      // ингестии приходит ISO-строка, и String(Date) !== String(ISO) всегда.
      // На строках любая повторная находка «обновляла» неизменившиеся даты.
      const before = existing[field] ? new Date(existing[field]).getTime() : null;
      const after = new Date(payload[field]).getTime();
      if (Number.isNaN(after) || before === after) continue;
      patch[field] = payload[field];
    }
    // Уточнение адреса. У ранних карточек url совпадал с адресом
    // страницы-списка: ссылки терялись при очистке HTML, и модель не могла
    // указать собственную страницу мероприятия. Если теперь пришёл адрес
    // конкретнее — заменяем и сбрасываем отметку добора, чтобы подробности
    // перечитались уже с нужной страницы.
    const wasListingUrl = existing.url && existing.url === existing.sourceUrl;
    const gotOwnUrl = payload.url && payload.url !== payload.sourceUrl;
    if (wasListingUrl && gotOwnUrl) {
      patch.url = payload.url;
      patch.detailsFetchedAt = null;
    }

    if (Object.keys(patch).length) await Conference.updateOne({ _id: existing._id }, { $set: patch });
    return { created: false, updated: Object.keys(patch), doc: existing };
  }

  const doc = await Conference.create({
    ...payload,
    categories: normalizeCategories(payload.categories),
    contentHash,
    slug: makeSlug(payload.title, payload.startDate),
    validationFlags: validateDraft(payload, options),
    status: "draft",
  });

  return { created: true, updated: [], doc };
}

/**
 * Проставить даты руками. Нужно там, где на странице общества года нет
 * вовсе: модель обязана оставить поле пустым, а человек находит дату за
 * минуту. Без этой возможности карточка застревала бы в очереди навсегда.
 */
export async function setConferenceDates(id, { startDate, endDate, registrationDeadline, abstractDeadline }) {
  const patch = {};
  const toDate = (v) => {
    if (!v) return null;
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  for (const [key, value] of Object.entries({
    startDate,
    endDate,
    registrationDeadline,
    abstractDeadline,
  })) {
    if (value === undefined) continue;
    patch[key] = toDate(value);
  }
  if (!Object.keys(patch).length) throw new Error("Не передано ни одной даты");

  // Флаг «нет даты начала» снимаем, когда её вписали: иначе предупреждение
  // висело бы на карточке, где проблемы уже нет.
  const doc = await Conference.findById(id);
  if (!doc) return null;
  const startAfter = patch.startDate !== undefined ? patch.startDate : doc.startDate;
  if (startAfter) {
    patch.validationFlags = (doc.validationFlags || []).filter(
      (f) => f !== "no_start_date",
    );
  }

  return Conference.findByIdAndUpdate(id, { $set: patch }, { new: true });
}

/** Решение человека: опубликовать или отклонить. */
export async function moderateConference(id, { status, rejectedReason = "" }) {
  if (!["published", "rejected", "draft"].includes(status)) {
    throw new Error("moderateConference: status must be published, rejected or draft");
  }

  // Без даты начала публиковать нечего: витрина отбирает по датам, и такая
  // карточка просто не появилась бы в списке — модератор решил бы, что
  // кнопка не сработала. Отказываем внятно.
  if (status === "published") {
    const doc = await Conference.findById(id).select("startDate").lean();
    if (doc && !doc.startDate) {
      throw new Error(
        "Нельзя опубликовать без даты начала — заполните её в карточке",
      );
    }
  }
  return Conference.findByIdAndUpdate(
    id,
    { $set: { status, rejectedReason, reviewedAt: new Date() } },
    { new: true },
  );
}
