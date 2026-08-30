import sources from "../../config/conferenceSources.js";
import * as cheerio from "cheerio";
import {
  extractConferences,
  extractConferenceDetails,
  isExtractorConfigured,
} from "./conference.extractor.js";
import Conference from "./conference.model.js";
import { upsertDraft, normalizeCategories } from "./conference.service.js";

// Обход источников: страница общества → текст → модель → черновики.
//
// Ничего не публикуется. Совсем. Даже с источника trust: "high" карточка
// попадает в очередь модерации, потому что автоматика здесь ошибается тихо:
// перенесённый конгресс, прошлогодняя страница в кеше, «annual meeting» без
// года. Цена ошибки — письмо тысяче врачей с неверной датой.

const USER_AGENT =
  process.env.CONFERENCE_UA ||
  "Mozilla/5.0 (compatible; DocPatsBot/1.0; +https://docpats.com)";
const PAGE_TIMEOUT_MS = 20000;
const PAUSE_BETWEEN_SOURCES_MS = 1500;

// Белый список доменов для validateDraft: ссылка за его пределы не
// отбрасывается, а помечается флагом — модератор увидит предупреждение.
const TRUSTED_DOMAINS = sources.map((s) => s.domain);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Текст страницы СО ССЫЛКАМИ.
 *
 * Обычный stripHtml выбрасывает адреса, и модель, которой велено вернуть
 * ссылку на мероприятие, физически не может её увидеть — она подставляла
 * адрес самой страницы общества. В итоге у карточек url совпадал с
 * sourceUrl, а второй проход перечитывал ту же страницу-список и не находил
 * ни программы, ни дедлайнов. Поэтому ссылки оставляем прямо в тексте:
 * «Название конгресса (https://…)».
 */
async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const $ = cheerio.load(await response.text());
  $("script, style, noscript").remove();
  const links = [];
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const href = String($el.attr("href") || "").trim();
    const text = $el.text().replace(/\s+/g, " ").trim();
    // Якоря, mailto и пустые подписи ничего не дают, а место занимают.
    if (!href || !text || href.startsWith("#") || href.startsWith("mailto:")) return;
    let absolute = href;
    try {
      absolute = new URL(href, response.url || url).toString();
    } catch {
      return;
    }
    links.push({ label: text, href: absolute });
    $el.replaceWith(`${text} (${absolute}) `);
  });

  return { text: $.text().replace(/\s+/g, " ").trim(), links, finalUrl: response.url || url };
}

/** "2026-09-01" → Date; мусор и null → null. */
function toDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Приводим то, что вернула модель, к форме документа.
 * Здесь же — единственное место, где источник «дарит» карточке свои
 * категории: если модель промолчала, тема источника всё равно известна.
 */
export function toPayload(item, source) {
  let url = String(item.url || "").trim();
  if (url.startsWith("/")) {
    try {
      url = new URL(url, source.eventsUrl).toString();
    } catch {
      url = source.eventsUrl;
    }
  }
  if (!url) url = source.eventsUrl;

  const categories = normalizeCategories(item.categories);

  return {
    title: String(item.title || "").trim(),
    organizer: String(item.organizer || source.name).trim(),
    description: String(item.description || "").trim(),
    startDate: toDate(item.startDate),
    endDate: toDate(item.endDate),
    registrationDeadline: toDate(item.registrationDeadline),
    abstractDeadline: toDate(item.abstractDeadline),
    city: String(item.city || "").trim(),
    country: String(item.country || source.country || "").trim().toUpperCase(),
    format: ["onsite", "online", "hybrid"].includes(item.format) ? item.format : "onsite",
    url,
    sourceSlug: source.slug,
    sourceUrl: source.eventsUrl,
    cmeCredits: String(item.cmeCredits || "").trim(),
    price: String(item.price || "").trim(),
    // Модель промолчала — берём тему источника. Общество кардиологов не
    // проводит конференций по стоматологии.
    categories: categories.length ? categories : normalizeCategories(source.categories),
  };
}

/** Один источник. Не бросает: падение одного сайта не должно ронять обход. */
export async function ingestSource(source) {
  const stat = { slug: source.slug, found: 0, created: 0, updated: 0, skipped: 0, past: 0, error: null };
  try {
    const { text } = await fetchPage(source.eventsUrl);
    const items = await extractConferences({
      sourceName: source.name,
      pageUrl: source.eventsUrl,
      text,
    });
    stat.found = items.length;

    for (const item of items) {
      const payload = toPayload(item, source);
      // Без названия или без даты начала карточка бесполезна и модератору:
      // по ней нельзя ни отличить дубль, ни поставить в очередь по сроку.
      if (!payload.title || !payload.startDate) {
        stat.skipped += 1;
        continue;
      }
      // Прошедшее не заводим вовсе. Опубликовать его нельзя, а в очереди
      // модерации оно только отнимает внимание: страницы обществ годами
      // держат анонсы прошлых конгрессов.
      const ends = payload.endDate || payload.startDate;
      if (ends < new Date()) {
        stat.past += 1;
        continue;
      }
      const result = await upsertDraft(payload, { trustedDomains: TRUSTED_DOMAINS });
      if (result.created) {
        stat.created += 1;
        // Сразу вторым проходом добираем подробности со страницы самой
        // конференции: на странице общества их нет, а карточка без программы
        // и дедлайна — это то же, что ссылка в поиске.
        await enrichConference(result.doc);
      } else if (result.updated.length) stat.updated += 1;
      else stat.skipped += 1;
    }
  } catch (err) {
    stat.error = err.message;
    console.error(`[conferences] ${source.slug}: ${err.message}`);
  }
  return stat;
}

/**
 * Полный обход.
 * @param {object} [options]
 * @param {string} [options.slug] — прогнать один источник (для проверки)
 */
export async function runConferenceIngestion({ slug } = {}) {
  const aiConfigured = isExtractorConfigured();
  const active = sources.filter((s) => s.isActive && (!slug || s.slug === slug));
  if (!active.length) {
    return { sources: 0, created: 0, updated: 0, stats: [], aiConfigured };
  }

  const stats = [];
  for (const source of active) {
    stats.push(await ingestSource(source));
    // Пауза между сайтами: обход общественных ресурсов не должен выглядеть
    // как нагрузка.
    await sleep(PAUSE_BETWEEN_SOURCES_MS);
  }

  const sum = (field) => stats.reduce((acc, s) => acc + s[field], 0);
  return {
    // Без ключа модель не вызывалась вовсе, и «найдено 0» означает не
    // «на сайтах пусто», а «извлекать было нечем». Разницу обязан видеть
    // тот, кто смотрит на пустую очередь модерации.
    aiConfigured,
    sources: stats.length,
    found: sum("found"),
    created: sum("created"),
    updated: sum("updated"),
    skipped: sum("skipped"),
    past: sum("past"),
    errors: stats.filter((s) => s.error).length,
    stats,
  };
}

export default runConferenceIngestion;

// ── Второй проход: добор подробностей со страницы конференции ────────────
//
// Заполняем только ПУСТЫЕ поля. Если модератор что-то поправил руками, его
// правка старше машинной: перезаписывать её значило бы наказывать за то,
// что человек сделал работу.

const FILLABLE_TEXT = ["description", "audience", "conditions", "venue", "cmeCredits", "price", "city"];
const FILLABLE_DATE = ["registrationDeadline", "abstractDeadline"];

// Подписи ссылок, за которыми обычно лежат сроки и деньги. Главную страницу
// конгресса организаторы держат витриной, а «Registration» и «Abstracts» —
// это уже страницы с датами, до которых надо успеть.
const REGISTRATION_LINK =
  /regist|abstract|fees?|pricing|tarif|submission|deadline|тезис|регистрац|kayıt|qeydiyyat/i;

/** Ссылка на страницу сроков — только на том же домене, чтобы не разбрестись. */
function findRegistrationLink(links, pageUrl) {
  let host;
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const { label, href } of links) {
    if (!REGISTRATION_LINK.test(label)) continue;
    try {
      const u = new URL(href);
      if (u.hostname.replace(/^www\./, "") !== host) continue;
      if (u.toString() === pageUrl) continue;
      return u.toString();
    } catch {
      /* битая ссылка — пропускаем */
    }
  }
  return null;
}

export async function enrichConference(doc) {
  const result = { slug: doc.slug, filled: [], error: null, secondPage: null };
  try {
    const { text, links } = await fetchPage(doc.url);
    const details = await extractConferenceDetails({
      title: doc.title,
      pageUrl: doc.url,
      text,
    });
    if (!details) {
      result.error = isExtractorConfigured() ? "модель не вернула данные" : "нет ключа модели";
      return result;
    }

    // Второй заход — на страницу регистрации, и только если после первой
    // так и нет сроков или условий. Это ещё один вызов модели на карточку,
    // и платить за него, когда всё уже нашлось, незачем.
    const stillMissingDates =
      !details.registrationDeadline && !doc.registrationDeadline &&
      !details.abstractDeadline && !doc.abstractDeadline;
    const stillMissingTerms = !details.conditions && !doc.conditions;

    if (stillMissingDates || stillMissingTerms) {
      const regUrl = findRegistrationLink(links, doc.url);
      if (regUrl) {
        try {
          const second = await fetchPage(regUrl);
          const more = await extractConferenceDetails({
            title: doc.title,
            pageUrl: regUrl,
            text: second.text,
          });
          if (more) {
            // Первая страница главнее: она о самом мероприятии. Со второй
            // берём только то, чего на первой не было.
            for (const key of Object.keys(more)) {
              const isEmpty = Array.isArray(details[key])
                ? !details[key].length
                : !details[key];
              if (isEmpty && more[key]) details[key] = more[key];
            }
            result.secondPage = regUrl;
          }
        } catch (e) {
          // Страница сроков не открылась — не повод терять уже собранное.
          console.warn(`[conferences] ${doc.slug}: страница сроков ${regUrl}: ${e.message}`);
        }
      }
    }

    const patch = {};
    for (const field of FILLABLE_TEXT) {
      const value = String(details[field] || "").trim();
      if (value && !String(doc[field] || "").trim()) patch[field] = value;
    }
    for (const field of FILLABLE_DATE) {
      const value = toDate(details[field]);
      if (value && !doc[field]) patch[field] = value;
    }
    if (Array.isArray(details.program) && details.program.length && !(doc.program || []).length) {
      patch.program = details.program.map((line) => String(line).trim()).filter(Boolean).slice(0, 12);
    }
    const country = String(details.country || "").trim().toUpperCase();
    if (country.length === 2 && !doc.country) patch.country = country;

    // Отметку ставим всегда, даже если добавить было нечего: иначе страница
    // будет перечитываться на каждом прогоне и платить за один и тот же ответ.
    patch.detailsFetchedAt = new Date();

    await Conference.updateOne({ _id: doc._id }, { $set: patch });
    result.filled = Object.keys(patch).filter((k) => k !== "detailsFetchedAt");
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

/** Добор для карточек, которых он ещё не касался. */
export async function enrichPending({ limit = 20 } = {}) {
  const docs = await Conference.find({
    detailsFetchedAt: null,
    status: { $in: ["draft", "published"] },
  })
    .limit(Math.min(Number(limit) || 20, 50))
    .lean();

  const results = [];
  for (const doc of docs) {
    results.push(await enrichConference(doc));
    await sleep(PAUSE_BETWEEN_SOURCES_MS);
  }
  return { processed: results.length, results };
}
