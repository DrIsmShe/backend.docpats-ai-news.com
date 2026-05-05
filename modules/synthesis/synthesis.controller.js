import Anthropic from "@anthropic-ai/sdk";
import Synthesis from "./synthesis.model.js";

const LOCALE_NAMES = {
  en: "English",
  az: "Azerbaijani",
  tr: "Turkish",
  ar: "Arabic",
};

const SUPPORTED_LOCALES = Object.keys(LOCALE_NAMES);

// Дефолтный размер страницы для списка статей.
// Фронт может передавать свой ?limit=N, но не больше MAX_PAGE_SIZE.
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// Таймаут 15 минут — длинные AR/TR переводы могут занимать 8-12 минут.
const anthropic = new Anthropic({ timeout: 900_000, maxRetries: 0 });

// ─── Перевод одной статьи через Claude (один вызов) ──────────
async function translateSynthesisArticle(title, body, locale) {
  const targetLanguage = LOCALE_NAMES[locale];

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `Translate this medical article from Russian to ${targetLanguage}.

STRICT RULES:
- Preserve ALL markdown exactly: #, ##, ###, **, *, lists, etc.
- Keep all citation references like [1], [2] unchanged
- Medical terminology must be precise
- Output ONLY the translated article, no commentary, no preamble

ARTICLE:
# ${title}

${body}`,
      },
    ],
  });

  const translated = message.content[0]?.text?.trim() || "";
  const firstLine = translated.split("\n").find((l) => l.startsWith("# "));
  const translatedTitle = firstLine ? firstLine.slice(2).trim() : title;

  return { title: translatedTitle, body: translated };
}

function validateTranslation(translated, locale) {
  if (!translated.body || translated.body.length < 1000) {
    throw new Error(
      `Output too short (${translated.body?.length || 0} chars) for ${locale}`,
    );
  }

  if (/(.)\1{30,}/.test(translated.body)) {
    throw new Error(`Detected character loop in ${locale} output`);
  }

  const headerCount = (translated.body.match(/^##\s+/gm) || []).length;
  if (headerCount < 3) {
    throw new Error(
      `Markdown structure broken: only ${headerCount} ## headers in ${locale}`,
    );
  }

  return true;
}

async function saveTranslation(articleId, locale, translatedTitle, body) {
  await Synthesis.updateOne(
    { _id: articleId },
    {
      $set: {
        [`translations.${locale}`]: {
          title: translatedTitle,
          body,
          translatedAt: new Date(),
        },
      },
    },
  );
}

async function translateOne(article, locale, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const label = attempt === 0 ? locale : `${locale} (retry ${attempt})`;
    try {
      console.log(`[Synthesis:prefetch] → ${label}...`);

      const translated = await translateSynthesisArticle(
        article.title,
        article.body,
        locale,
      );

      validateTranslation(translated, locale);

      await saveTranslation(
        article._id,
        locale,
        translated.title,
        translated.body,
      );

      console.log(
        `[Synthesis:prefetch] ✓ ${locale} готов (${translated.body.length} chars)`,
      );
      return;
    } catch (err) {
      const isLast = attempt === retries;
      const prefix = isLast ? "✗" : "⚠";
      console.error(
        `[Synthesis:prefetch] ${prefix} ${label}: ${err.message}`,
      );
      if (isLast) throw err;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
}

export async function translateAllLocales(article) {
  const locales = Object.keys(LOCALE_NAMES);

  console.log(
    `[Synthesis:prefetch] Начинаем перевод "${article.title.slice(0, 50)}..." на ${locales.join(", ")} (параллельно)`,
  );

  const startTime = Date.now();

  const results = await Promise.allSettled(
    locales.map((locale) => translateOne(article, locale)),
  );

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failedLocales = results
    .map((r, i) => (r.status === "rejected" ? locales[i] : null))
    .filter(Boolean);

  console.log(
    `[Synthesis:prefetch] Все переводы завершены: ${article._id} (${succeeded}/${results.length} успешно за ${elapsed}s)`,
  );

  if (failedLocales.length > 0) {
    console.warn(
      `[Synthesis:prefetch] ⚠ Не удалось перевести: ${failedLocales.join(", ")} — нужен retranslate`,
    );
  }
}

// ─── GET /api/synthesis — список с пагинацией для lazy load ──
// Параметры query:
//   page=1 (default 1)
//   limit=25 (default 25, cap 100)
//   specialty (optional)
//   locale (en|az|tr|ar — для подмены title переводом из кэша)
// Ответ:
//   { success, articles, total, page, limit, totalPages, hasMore }
export async function getList(req, res) {
  try {
    const { specialty, locale } = req.query;

    // Безопасный парсинг page/limit с защитой от мусора
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const requestedLimit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE);

    const filter = { status: "published" };
    if (specialty) filter.specialty = specialty;

    const needsTranslation =
      locale && locale !== "ru" && SUPPORTED_LOCALES.includes(locale);

    const [articles, total] = await Promise.all([
      Synthesis.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(needsTranslation ? "-body" : "-body -translations")
        .lean(),
      Synthesis.countDocuments(filter),
    ]);

    const mapped = needsTranslation
      ? articles.map((a) => {
          const cached = a.translations?.[locale];
          return {
            ...a,
            title: cached?.title || a.title,
            translations: undefined,
          };
        })
      : articles;

    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    res.json({
      success: true,
      articles: mapped,
      total,        // реальное число статей в БД (для lazy load и счётчика)
      page,
      limit,
      totalPages,
      hasMore,      // фронт смотрит сюда: подгружать ли ещё
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── GET /api/synthesis/:id — полная статья ──────────────────
export async function getOne(req, res) {
  try {
    const article = await Synthesis.findById(req.params.id)
      .select("-translations")
      .lean();
    if (!article)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, article });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── POST /api/synthesis/:id/translate ───────────────────────
export async function translateArticle(req, res) {
  try {
    const { locale } = req.body;

    if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported locale. Supported: ${SUPPORTED_LOCALES.join(", ")}`,
      });
    }

    const article = await Synthesis.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    // ── 1. Кэш — мгновенно ──────────────────────────────────
    const cached = article.translations?.get(locale);
    if (cached?.title && cached?.body) {
      console.log(
        `[Synthesis:translate] Cache hit: ${article._id} → ${locale}`,
      );
      return res.json({
        success: true,
        translated: { title: cached.title, body: cached.body },
        fromCache: true,
      });
    }

    // ── 2. Кэша нет — SSE стрим (живой перевод) ─────────────
    console.log(
      `[Synthesis:translate] SSE streaming: ${article._id} → ${locale}`,
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    let fullText = "";
    let clientClosed = false;

    req.on("close", () => {
      clientClosed = true;
    });

    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: `Translate this medical article from Russian to ${LOCALE_NAMES[locale]}.

STRICT RULES:
- Preserve ALL markdown exactly: #, ##, ###, **, *, lists, etc.
- Keep all citation references like [1], [2] unchanged
- Medical terminology must be precise
- Output ONLY the translated article, no commentary, no preamble

ARTICLE:
# ${article.title}

${article.body}`,
          },
        ],
      });

      for await (const event of stream) {
        if (clientClosed) break;
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta"
        ) {
          const chunk = event.delta.text;
          fullText += chunk;
          send({ chunk });
        }
      }
    } catch (streamErr) {
      console.error(
        `[Synthesis:translate] Stream error ${article._id}/${locale}:`,
        streamErr.message,
      );
      if (!res.writableEnded) {
        send({ error: streamErr.message });
        res.end();
      }
      return;
    }

    const firstLine = fullText.split("\n").find((l) => l.startsWith("# "));
    const translatedTitle = firstLine
      ? firstLine.slice(2).trim()
      : article.title;

    if (fullText.length >= 1000) {
      try {
        await saveTranslation(article._id, locale, translatedTitle, fullText);
        console.log(
          `[Synthesis:translate] ✓ Cached after stream: ${article._id} → ${locale}`,
        );
      } catch (saveErr) {
        console.error(
          `[Synthesis:translate] Cache save error: ${saveErr.message}`,
        );
      }
    }

    if (!clientClosed && !res.writableEnded) {
      send({ done: true, title: translatedTitle });
      res.end();
    }
  } catch (err) {
    console.error("[Synthesis:translate] Error:", err.message);
    if (res.headersSent) {
      try {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      } catch {}
    } else {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}