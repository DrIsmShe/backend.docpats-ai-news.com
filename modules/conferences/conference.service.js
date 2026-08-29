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

  return { items, total, page: Math.max(Number(page) || 1, 1), limit: perPage };
}

export async function getConferenceBySlug(slug) {
  return Conference.findOne({ slug: String(slug || "").toLowerCase(), status: "published" }).lean();
}

/**
 * Очередь модерации. По умолчанию — то, что ИИ нашёл, а человек ещё не
 * смотрел; но экрану нужны и уже опубликованные (снять с публикации), и
 * отклонённые (решение могло быть ошибочным — карточки не удаляются).
 */
export async function listDrafts({ limit = 50, status = "draft" } = {}) {
  const filter = ["draft", "published", "rejected"].includes(status)
    ? { status }
    : {};
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

/** Решение человека: опубликовать или отклонить. */
export async function moderateConference(id, { status, rejectedReason = "" }) {
  if (!["published", "rejected", "draft"].includes(status)) {
    throw new Error("moderateConference: status must be published, rejected or draft");
  }
  return Conference.findByIdAndUpdate(
    id,
    { $set: { status, rejectedReason, reviewedAt: new Date() } },
    { new: true },
  );
}
