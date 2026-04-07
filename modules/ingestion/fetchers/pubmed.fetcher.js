import axios from "axios";

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

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

        summary: item.elocationid || "",

        canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,

        publishedAt: item.pubdate ? new Date(item.pubdate) : new Date(),

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
