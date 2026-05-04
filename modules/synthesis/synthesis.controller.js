import Anthropic from "@anthropic-ai/sdk";
import Synthesis from "./synthesis.model.js";

const LOCALE_NAMES = {
  en: "English",
  az: "Azerbaijani",
  tr: "Turkish",
  ar: "Arabic",
};

const SUPPORTED_LOCALES = Object.keys(LOCALE_NAMES);

// Таймаут 15 минут — длинные AR/TR переводы могут занимать 8-12 минут.
// maxRetries: 0 — мы делаем retry вручную с валидацией качества вывода.
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

// ─── Валидация качества перевода ─────────────────────────────
// Защита от: loop с повторяющимися символами (как был с AR-диакритиком),
// обрыва на полпути, мусорного/пустого вывода.
function validateTranslation(translated, locale) {
  if (!translated.body || translated.body.length < 1000) {
    throw new Error(
      `Output too short (${translated.body?.length || 0} chars) for ${locale}`,
    );
  }

  // 30+ одинаковых символов подряд = модель ушла в loop
  if (/(.)\1{30,}/.test(translated.body)) {
    throw new Error(`Detected character loop in ${locale} output`);
  }

  // Markdown структура — должно быть минимум 3 раздела ##
  const headerCount = (translated.body.match(/^##\s+/gm) || []).length;
  if (headerCount < 3) {
    throw new Error(
      `Markdown structure broken: only ${headerCount} ## headers in ${locale}`,
    );
  }

  return true;
}

// ─── Перевод одной локали с retry и валидацией ────────────────
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

      // Свежий fetch — на случай параллельных сохранений других локалей
      const doc = await Synthesis.findById(article._id);
      if (!doc) {
        console.warn(
          `[Synthesis:prefetch] ⚠ Article ${article._id} deleted, abort ${locale}`,
        );
        return;
      }

      doc.translations.set(locale, {
        title: translated.title,
        body: translated.body,
        translatedAt: new Date(),
      });
      await doc.save();

      console.log(
        `[Synthesis:prefetch] ✓ ${locale} готов (${translated.body.length} chars)`,
      );
      return;
    } catch (err) {
      const isLast = attempt === retries;
      const prefix = isLast ? "✗" : "⚠";
      console.error(`[Synthesis:prefetch] ${prefix} ${label}: ${err.message}`);
      if (isLast) throw err;
      // Linear backoff: 5s → 10s
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
}

// ─── Фоновый перевод на все языки (параллельно) ──────────────
export async function translateAllLocales(article) {
  const locales = Object.keys(LOCALE_NAMES);

  console.log(
    `[Synthesis:prefetch] Начинаем перевод "${article.title.slice(0, 50)}..." на ${locales.join(", ")} (параллельно)`,
  );

  const startTime = Date.now();

  // Параллельный запуск — все локали идут одновременно через Promise.allSettled
  // (раньше был for...of await — последовательно, общее время суммировалось)
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

// ─── GET /api/synthesis — список карточек ────────────────────
// Поддерживает ?locale=en|az|tr|ar — возвращает переведённые заголовки
export async function getList(req, res) {
  try {
    const { specialty, page = 1, limit = 10, locale } = req.query;
    const filter = { status: "published" };
    if (specialty) filter.specialty = specialty;

    const needsTranslation =
      locale && locale !== "ru" && SUPPORTED_LOCALES.includes(locale);

    const [articles, total] = await Promise.all([
      Synthesis.find(filter)
        .sort({ createdAt: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        // Если нужен перевод — грузим translations (только заголовки там лёгкие)
        .select(needsTranslation ? "-body" : "-body -translations")
        .lean(),
      Synthesis.countDocuments(filter),
    ]);

    // Подменяем title на переведённый если есть в кэше
    const mapped = needsTranslation
      ? articles.map((a) => {
          const cached = a.translations?.[locale];
          return {
            ...a,
            title: cached?.title || a.title,
            translations: undefined, // не гоним тяжёлые поля клиенту
          };
        })
      : articles;

    res.json({ success: true, articles: mapped, total, page: +page });
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

    // ── 2. Свежая статья < 40 мин — перевод ещё идёт в фоне
    const ageMin = (Date.now() - new Date(article.createdAt)) / 60000;
    if (ageMin < 40) {
      console.log(
        `[Synthesis:translate] Pending (${Math.round(ageMin)} мин): ${article._id} → ${locale}`,
      );
      return res.json({
        success: true,
        translationPending: true,
        translated: { title: article.title, body: article.body },
      });
    }

    // ── 3. Старая статья без перевода — SSE стриминг ────────
    console.log(
      `[Synthesis:translate] SSE fallback: ${article._id} → ${locale}`,
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    let fullText = "";

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
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        const chunk = event.delta.text;
        fullText += chunk;
        send({ chunk });
      }
    }

    const firstLine = fullText.split("\n").find((l) => l.startsWith("# "));
    const translatedTitle = firstLine
      ? firstLine.slice(2).trim()
      : article.title;

    article.translations.set(locale, {
      title: translatedTitle,
      body: fullText,
      translatedAt: new Date(),
    });
    await article.save();

    send({ done: true, title: translatedTitle });
    res.end();
  } catch (err) {
    console.error("[Synthesis:translate] Error:", err.message);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
