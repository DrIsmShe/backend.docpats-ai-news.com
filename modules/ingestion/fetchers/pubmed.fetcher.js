import axios from "axios";

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/**
 * Когда работа стала ДОСТУПНА читателю.
 *
 * PubMed отдаёт две даты, и они означают разное:
 *   pubdate  — дата выпуска журнала, часто В БУДУЩЕМ. Журналы датируют номера
 *              вперёд: статья доступна онлайн сегодня, а в бумаге выйдет,
 *              скажем, в январе 2027.
 *   epubdate — когда статья реально появилась онлайн.
 *
 * Раньше бралась pubdate как есть, и в ленте оказалось 152 материала с датами
 * до 2027 года. Сортировка идёт по дате, поэтому они намертво висели вверху —
 * причём именно они самые свежие, а значит ещё не переведённые и без текста.
 * Один дефект давал сразу три симптома.
 *
 * Берём epubdate, если она в прошлом. Иначе — pubdate, если она в прошлом.
 * Если обе в будущем, ставим сегодняшний день: материал ведь уже доступен,
 * раз PubMed его отдал.
 */
function availableSince(item, now = new Date()) {
  for (const raw of [item.epubdate, item.sortpubdate, item.pubdate]) {
    if (!raw) continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.valueOf()) && parsed <= now) return parsed;
  }
  return now;
}

/** DOI из ответа PubMed. Лежит в articleids, а не отдельным полем. */
function extractDoi(item) {
  const ids = Array.isArray(item.articleids) ? item.articleids : [];
  return ids.find((a) => a.idtype === "doi")?.value || null;
}

async function fetchPubMed(source) {
  try {
    const searchUrl = `${PUBMED_BASE}/esearch.fcgi`;

    const search = await axios.get(searchUrl, {
      params: {
        db: "pubmed",
        term: source.config.query,
        retmode: "json",
        retmax: 20,
        sort: "pub date",
      },
    });

    const ids = search.data.esearchresult.idlist;

    if (!ids.length) return [];

    const fetchUrl = `${PUBMED_BASE}/esummary.fcgi`;

    const summary = await axios.get(fetchUrl, {
      params: {
        db: "pubmed",
        id: ids.join(","),
        retmode: "json",
      },
    });

    const articles = ids.map((id) => {
      const item = summary.data.result[id];

      return {
        externalId: id,

        title: item.title || "",

        // elocationid — это служебный идентификатор («doi: 10.1016/…»), а не
        // аннотация. Раньше он попадал в summary, и в карточке материала
        // вместо краткого содержания стояла строка из тридцати символов.
        // Лучше пусто: аннотацию потом добирает экстрактор полного текста.
        summary: "",

        canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,

        publishedAt: availableSince(item),

        // PMID и DOI были пусты у всех материалов, хотя приходят в этом же
        // ответе. Без них нельзя ни сослаться на первоисточник надёжно, ни
        // связать материал с поиском доказательств.
        pmid: id,
        doi: extractDoi(item),

        authors: item.authors ? item.authors.map((a) => a.name) : [],

        journal: item.fulljournalname || "",

        sourceName: source.name,
        sourceSlug: source.slug,
      };
    });

    return articles;
  } catch (error) {
    console.error("PubMed error:", error.message);
    return [];
  }
}

export { fetchPubMed };
