import sources from "../../config/conferenceSources.js";
import { stripHtml } from "../../utils/html.js";
import { extractConferences, isExtractorConfigured } from "./conference.extractor.js";
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

async function fetchPageText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return stripHtml(await response.text());
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
  const stat = { slug: source.slug, found: 0, created: 0, updated: 0, skipped: 0, error: null };
  try {
    const text = await fetchPageText(source.eventsUrl);
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
      const result = await upsertDraft(payload, { trustedDomains: TRUSTED_DOMAINS });
      if (result.created) stat.created += 1;
      else if (result.updated.length) stat.updated += 1;
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
    errors: stats.filter((s) => s.error).length,
    stats,
  };
}

export default runConferenceIngestion;
