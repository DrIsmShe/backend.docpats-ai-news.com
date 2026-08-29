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
5. "url" must be a link that appears on the page. If none, use the page URL.
6. "categories": [] when the event is not tied to a specialty (health law, AI
   in medicine, clinic management) — such events matter to every doctor.
7. "country": ISO 3166-1 alpha-2, uppercase. Null if no city is stated.
8. At most ${MAX_ITEMS} events, the soonest first.

PAGE TEXT:
${text.slice(0, MAX_TEXT)}`;
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
