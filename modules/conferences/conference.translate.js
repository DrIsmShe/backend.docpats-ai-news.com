import Anthropic from "@anthropic-ai/sdk";
import Conference from "./conference.model.js";

// Перевод карточек на языки интерфейса.
//
// Источники пишут по-английски, а рубрику открывают врачи, читающие на пяти
// языках. Переводим ровно то, что человек читает: название, описание,
// программу, кому адресовано и условия участия. Даты, город, цену и ссылку
// не трогаем — их «перевод» это способ испортить факт.
//
// Отдельный модуль, а не общий translateWithAI: тот сделан под статью
// (title/abstract/content), и загонять в него программу списком значило бы
// склеивать её в текст и потом разбирать обратно.

export const UI_LANGUAGES = ["ru", "en", "az", "tr", "ar"];
const SOURCE_LANGUAGE = "en";
const MODEL = process.env.CONFERENCE_MODEL || "claude-opus-5";

const LANGUAGE_NAMES = {
  ru: "Russian",
  az: "Azerbaijani",
  tr: "Turkish",
  ar: "Arabic",
  en: "English",
};

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    _client = new Anthropic();
  }
  return _client;
}

const TOOL = {
  name: "record_translation",
  description: "Record the translated fields of a conference card.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      audience: { type: "string" },
      conditions: { type: "string" },
      program: { type: "array", items: { type: "string" } },
    },
    required: ["title", "description", "audience", "conditions", "program"],
  },
};

// Служебная разметка вызова инструмента, просочившаяся в текст. Модель,
// обязанная схемой вернуть ВСЕ поля, на пустом входе иногда пишет в значение
// собственные разделители — и они уезжали на витрину как «перевод».
const LEAKED_MARKUP = /<\/?antml|<\s*\/?\s*parameter|<function_calls>|<invoke/i;

/** Пусто на входе — пусто на выходе. Переводить нечего, выдумывать нельзя. */
function sanitize(value, sourceValue) {
  if (!sourceValue) return "";
  const text = String(value || "").trim();
  if (!text || LEAKED_MARKUP.test(text)) return "";
  return text;
}

function sanitizeList(value, sourceValue) {
  if (!Array.isArray(sourceValue) || !sourceValue.length) return [];
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((line) => String(line || "").trim())
    .filter((line) => line && !LEAKED_MARKUP.test(line));
  return cleaned.length ? cleaned : [];
}

/** Одна карточка на один язык. Возвращает null, если переводить нечем. */
export async function translateConference(doc, lang) {
  const client = getClient();
  if (!client) return null;
  if (!UI_LANGUAGES.includes(lang) || lang === SOURCE_LANGUAGE) return null;

  // Пустые поля в запрос не кладём вовсе: именно на них модель начинала
  // сочинять — вплоть до собственных служебных тегов в значении.
  const payload = {};
  for (const field of ["title", "description", "audience", "conditions"]) {
    if (doc[field]) payload[field] = doc[field];
  }
  if (Array.isArray(doc.program) && doc.program.length) payload.program = doc.program;
  if (!Object.keys(payload).length) return null;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low" },
    system:
      "You translate a medical conference listing. TRANSLATE EVERY FIELD, " +
      "including each line of `program` — those are session and track " +
      "descriptions, not names, and leaving them in English defeats the " +
      "purpose. Keep unchanged only: the conference's own name, society " +
      "names, abbreviations (ESC, CME, ECR) and numbers. An empty input " +
      "field stays empty. Do not add, explain or summarise anything.",
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content:
          `Translate these fields into ${LANGUAGE_NAMES[lang]}.\n\n` +
          JSON.stringify(payload, null, 2),
      },
    ],
  });

  const call = response.content.find(
    (b) => b.type === "tool_use" && b.name === TOOL.name,
  );
  return call?.input || null;
}

/** Перевести одну карточку на все языки интерфейса и сохранить. */
export async function translateConferenceAll(doc, { force = false } = {}) {
  const result = { slug: doc.slug, done: [], error: null };
  try {
    const patch = {};
    for (const lang of UI_LANGUAGES) {
      if (lang === SOURCE_LANGUAGE) continue;
      if (!force && doc.translations?.[lang]?.title) continue; // уже переведено
      const t = await translateConference(doc, lang);
      if (!t) continue;
      patch[`translations.${lang}`] = {
        title: sanitize(t.title, doc.title),
        description: sanitize(t.description, doc.description),
        audience: sanitize(t.audience, doc.audience),
        conditions: sanitize(t.conditions, doc.conditions),
        program: sanitizeList(t.program, doc.program),
      };
      result.done.push(lang);
    }
    patch.translationStatus = result.done.length ? "done" : "failed";
    await Conference.updateOne({ _id: doc._id }, { $set: patch });
  } catch (err) {
    result.error = err.message;
    await Conference.updateOne(
      { _id: doc._id },
      { $set: { translationStatus: "failed" } },
    );
  }
  return result;
}

/**
 * Опубликованные карточки без перевода. Переводим только опубликованное:
 * платить за перевод того, что модератор отклонит, незачем.
 */
export async function translatePending({ limit = 10, force = false } = {}) {
  const docs = await Conference.find({
    status: "published",
    ...(force ? {} : { translationStatus: { $ne: "done" } }),
  })
    .limit(Math.min(Number(limit) || 10, 30))
    .lean();

  const results = [];
  for (const doc of docs) results.push(await translateConferenceAll(doc, { force }));
  return { processed: results.length, results };
}
