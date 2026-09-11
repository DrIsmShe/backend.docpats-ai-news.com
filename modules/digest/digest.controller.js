// modules/digest/digest.controller.js
//
// Публичная выдача дайджеста.
//
// ЧТО ЗДЕСЬ ВАЖНО. Наружу уходит только наш текст и ссылка на источник.
// Полного текста чужой публикации в этой коллекции нет вовсе — это не
// правило, которое надо помнить, а свойство схемы (см. digest.model.js).
//
// Язык выбирается по locale. Если нашего изложения на этом языке нет,
// отдаём русское, а в поле lang пишем, на каком языке ответ на самом
// деле, — читатель и разметка должны знать правду, иначе получится
// hreflang, объявляющий несуществующий перевод.

import DigestItem, { ЯЗЫКИ_ДАЙДЖЕСТА } from "./digest.model.js";

const ЯЗЫК_ПО_УМОЛЧАНИЮ = "ru";
const ПРЕДЕЛ_СТРАНИЦЫ = 50;

function язык(req) {
  const к = String(
    req.query.locale || req.headers["accept-language"]?.slice(0, 2) || "",
  )
    .slice(0, 2)
    .toLowerCase();
  return ЯЗЫКИ_ДАЙДЖЕСТА.includes(к) ? к : ЯЗЫК_ПО_УМОЛЧАНИЮ;
}

/** Достать изложение на нужном языке, с откатом на русский. */
function изложение(запись, желаемый) {
  const тексты = запись.texts || {};
  const взять = (к) => {
    const т = тексты instanceof Map ? тексты.get(к) : тексты[к];
    return т && т.intro ? { ...т, lang: к } : null;
  };
  return взять(желаемый) || взять(ЯЗЫК_ПО_УМОЛЧАНИЮ) || null;
}

/** Языки, на которых изложение реально есть — для hreflang. */
function доступныеЯзыки(запись) {
  const тексты = запись.texts || {};
  return ЯЗЫКИ_ДАЙДЖЕСТА.filter((к) => {
    const т = тексты instanceof Map ? тексты.get(к) : тексты[к];
    return Boolean(т && т.intro);
  });
}

function карточка(запись, желаемый) {
  const т = изложение(запись, желаемый);
  if (!т) return null;
  return {
    slug: запись.slug,
    title: т.title || запись.originalTitle,
    intro: т.intro,
    lang: т.lang,
    availableLangs: доступныеЯзыки(запись),
    originalTitle: запись.originalTitle,
    canonicalUrl: запись.canonicalUrl,
    sourceName: запись.sourceName,
    journal: запись.journal,
    doi: запись.doi,
    pmid: запись.pmid,
    specialty: запись.specialty,
    specialties: запись.specialties,
    tags: запись.tags,
    importanceScore: запись.importanceScore,
    evidenceLevel: запись.evidenceLevel,
    evidenceSignals: запись.evidenceSignals,
    publishedAt: запись.publishedAt,
  };
}

/** GET /api/digest — лента. */
export async function список(req, res) {
  try {
    const желаемый = язык(req);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 20, 1),
      ПРЕДЕЛ_СТРАНИЦЫ,
    );
    const page = Math.max(Number(req.query.page) || 1, 1);

    const условие = { status: "published" };
    if (req.query.specialty) {
      условие.$or = [
        { specialty: req.query.specialty },
        { specialties: req.query.specialty },
      ];
    }

    /* Поиск идёт по НАШЕМУ тексту и по заголовку оригинала. Регулярка, а
       не текстовый индекс: тексты лежат в Map по пяти языкам, и один
       $text по ним не построить. На объёмах дайджеста это приемлемо. */
    const q = String(req.query.q || "").trim();
    if (q.length >= 2) {
      const рег = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      условие.$and = [
        {
          $or: [
            { originalTitle: рег },
            { [`texts.${желаемый}.title`]: рег },
            { [`texts.${желаемый}.intro`]: рег },
          ],
        },
      ];
    }

    const [записи, всего] = await Promise.all([
      DigestItem.find(условие)
        .sort({ publishedAt: -1, importanceScore: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DigestItem.countDocuments(условие),
    ]);

    const данные = записи.map((з) => карточка(з, желаемый)).filter(Boolean);

    res.json({
      success: true,
      locale: желаемый,
      page,
      limit,
      total: всего,
      pages: Math.ceil(всего / limit),
      data: данные,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/** GET /api/digest/categories — специальности с количеством. */
export async function рубрики(req, res) {
  try {
    const категории = await DigestItem.aggregate([
      { $match: { status: "published" } },
      { $unwind: "$specialties" },
      { $group: { _id: "$specialties", count: { $sum: 1 } } },
      { $match: { _id: { $ne: "general" } } },
      { $sort: { count: -1 } },
      { $limit: 60 },
    ]);
    res.json({ success: true, categories: категории });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/** GET /api/digest/:slug — одна запись. */
export async function запись(req, res) {
  try {
    const желаемый = язык(req);
    const найдено = await DigestItem.findOne({
      slug: req.params.slug,
      status: "published",
    }).lean();

    if (!найдено) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const данные = карточка(найдено, желаемый);
    if (!данные) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({ success: true, data: данные });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export default { список, рубрики, запись };
