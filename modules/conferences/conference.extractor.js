import Anthropic from "@anthropic-ai/sdk";
import { CATEGORY_CODES } from "./conference.service.js";

// Извлечение карточек со страницы «Events» сайта общества.
//
// Модель здесь делает ровно одну работу: превращает текст страницы в поля.
// Она НЕ решает, публиковать ли, и НЕ ищет источники — и то и другое
// сознательно вынесено из её рук. Всё, что она вернёт, ложится в черновики.
//
// Главное правило промпта — «не знаешь, ставь null». Модель пишет
// правдоподобное, а не верное: выдуманная дата конгресса выглядит ровно так
// же, как настоящая, и отличить её постфактум нельзя. Пустое поле модератор
// увидит и заполнит, придуманное — пропустит.
//
// Форму ответа держит не промпт, а СХЕМА ИНСТРУМЕНТА со strict: true. Просьба
// «верни JSON» словами — это просьба; схема — ограничение.

const MAX_TEXT = 12000; // потолок на страницу: дальше платим за навигацию сайта
const MAX_ITEMS = 12;
const MODEL = process.env.CONFERENCE_MODEL || "claude-opus-5";

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    _client = new Anthropic();
  }
  return _client;
}

// Пустая строка вместо null не годится: нам важно отличать «на странице
// написано, что бесплатно» от «на странице про цену ничего нет».
const nullable = (type) => ({ type: [type, "null"] });

const CONFERENCE_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    organizer: nullable("string"),
    description: nullable("string"),
    startDate: nullable("string"),
    endDate: nullable("string"),
    registrationDeadline: nullable("string"),
    abstractDeadline: nullable("string"),
    city: nullable("string"),
    country: nullable("string"),
    format: { type: "string", enum: ["onsite", "online", "hybrid"] },
    url: { type: "string" },
    cmeCredits: nullable("string"),
    price: nullable("string"),
    categories: { type: "array", items: { type: "string", enum: CATEGORY_CODES } },
  },
  required: [
    "title",
    "organizer",
    "description",
    "startDate",
    "endDate",
    "registrationDeadline",
    "abstractDeadline",
    "city",
    "country",
    "format",
    "url",
    "cmeCredits",
    "price",
    "categories",
  ],
};

const TOOL = {
  name: "record_conferences",
  description: "Record the upcoming conferences found on this page.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      conferences: { type: "array", items: CONFERENCE_ITEM },
    },
    required: ["conferences"],
  },
};

function buildPrompt({ sourceName, pageUrl, text }) {
  return `Extract UPCOMING medical conferences from the events page of a professional society.

Source: ${sourceName}
Page URL: ${pageUrl}

RULES — follow them literally:
1. Extract only real events announced on THIS page. Never invent an event.
2. If a field is not stated on the page, pass null. Do NOT guess, do NOT infer
   a year, do NOT reuse a date from another event.
3. Skip events that have already ended.
4. Dates: strict "YYYY-MM-DD". A month without a day is the 1st of that month.
   If the year is not written on the page, the date is null.
5. "url": the link to THIS event's own page. Links appear in the text as
   "link text (https://…)" — copy the address of the event's own page, not
   the address of this listing page. Only if the event has no own link at
   all, use the page URL.
6. "categories": [] when the event is not tied to a specialty (health law, AI
   in medicine, clinic management) — such events matter to every doctor.
7. "country": ISO 3166-1 alpha-2, uppercase. Null if no city is stated.
8. At most ${MAX_ITEMS} events, the soonest first.

PAGE TEXT:
${text.slice(0, MAX_TEXT)}`;
}

/**
 * Настроен ли извлекатель. Нужен вызывающему, чтобы отличить «на страницах
 * нет анонсов» от «модель вообще не вызывалась»: в обоих случаях кандидатов
 * ноль, но это разные новости для того, кто смотрит на пустую очередь.
 */
export function isExtractorConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * @returns {Promise<Array<object>>} кандидаты, как их увидела модель.
 *   Пустой массив — и когда ключа нет, и когда на странице ничего нет:
 *   для вызывающего это одно и то же «добавить нечего».
 */
export async function extractConferences({ sourceName, pageUrl, text }) {
  const client = getClient();
  if (!client) {
    console.warn("[conferences] ANTHROPIC_API_KEY не задан — извлечение пропущено");
    return [];
  }
  if (!text || text.length < 200) return [];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Извлечение полей — работа механическая, глубокое рассуждение ей ничего
    // не добавляет, а обход платный и еженедельный. Точность здесь держит
    // схема и правило про null, а не размышление.
    output_config: { effort: "medium" },
    system:
      "You are a careful data extractor for a medical education catalogue. " +
      "You never invent facts. Missing data is null.",
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: buildPrompt({ sourceName, pageUrl, text }) }],
  });

  const call = response.content.find(
    (block) => block.type === "tool_use" && block.name === TOOL.name,
  );
  if (!call) {
    console.error("[conferences] модель не вызвала инструмент, страница пропущена:", pageUrl);
    return [];
  }

  const items = Array.isArray(call.input?.conferences) ? call.input.conferences : [];
  return items.slice(0, MAX_ITEMS);
}

export default extractConferences;

// ── Второй проход: страница самой конференции ────────────────────────────
//
// Страница «Events» общества — это анонс в две строки. Всё, ради чего врач
// открывает карточку (программа, кому адресовано, сколько стоит, до какого
// числа регистрация), лежит на сайте мероприятия. Отдельный вызов на
// отдельной странице, поэтому и промпт свой: здесь не надо находить события,
// надо разобрать одно.

const DETAILS_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: nullable("string"),
    program: { type: "array", items: { type: "string" } },
    audience: nullable("string"),
    conditions: nullable("string"),
    venue: nullable("string"),
    registrationDeadline: nullable("string"),
    abstractDeadline: nullable("string"),
    cmeCredits: nullable("string"),
    price: nullable("string"),
    city: nullable("string"),
    country: nullable("string"),
  },
  required: [
    "description",
    "program",
    "audience",
    "conditions",
    "venue",
    "registrationDeadline",
    "abstractDeadline",
    "cmeCredits",
    "price",
    "city",
    "country",
  ],
};

const DETAILS_TOOL = {
  name: "record_conference_details",
  description: "Record the details of this one conference from its own page.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { details: DETAILS_ITEM },
    required: ["details"],
  },
};

/**
 * @returns {Promise<object|null>} null — ключа нет, текста нет или модель
 *   не вызвала инструмент. Пустые поля означают «на странице не сказано».
 */
export async function extractConferenceDetails({ title, pageUrl, text }) {
  const client = getClient();
  if (!client) return null;
  if (!text || text.length < 200) return null;

  const prompt = `Read the official page of ONE medical conference and record its details.

Conference: ${title}
Page URL: ${pageUrl}

RULES — follow them literally:
1. Describe only what this page says. Never invent a fact.
2. Anything the page does not state is null (or [] for program).
3. "program": the topics, tracks or key sessions as short lines — at most 12.
   Not the schedule by hour, not speaker biographies.
4. "audience": who the event is addressed to, in one sentence.
5. "conditions": what a participant must do or pay to take part —
   registration steps, membership requirements, refund or visa terms.
   One short paragraph, plain text.
6. "venue": the building or campus, not the city.
7. Dates strict "YYYY-MM-DD". No year on the page → null.
8. "price": quote the page ("from EUR 450", "free for members"), do not compute.
9. Write description, audience and conditions in ENGLISH regardless of the
   page language — переводом на языки интерфейса занимается отдельный слой.

PAGE TEXT:
${text.slice(0, MAX_TEXT)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    system:
      "You are a careful data extractor for a medical education catalogue. " +
      "You never invent facts. Missing data is null.",
    tools: [DETAILS_TOOL],
    tool_choice: { type: "tool", name: DETAILS_TOOL.name },
    messages: [{ role: "user", content: prompt }],
  });

  const call = response.content.find(
    (block) => block.type === "tool_use" && block.name === DETAILS_TOOL.name,
  );
  return call?.input?.details || null;
}
