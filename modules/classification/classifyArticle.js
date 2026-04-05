export function classifyArticle(article) {
  const text = `${article.title} ${article.summary}`.toLowerCase();

  let specialty = "general";
  let type = "news";

  if (
    text.includes("trial") ||
    text.includes("study") ||
    text.includes("research")
  ) {
    type = "research";
  }

  if (
    text.includes("cancer") ||
    text.includes("tumor") ||
    text.includes("oncology")
  ) {
    specialty = "oncology";
  }

  if (
    text.includes("heart") ||
    text.includes("cardiac") ||
    text.includes("cardiology")
  ) {
    specialty = "cardiology";
  }

  if (text.includes("brain") || text.includes("neuro")) {
    specialty = "neurology";
  }

  if (text.includes("infection") || text.includes("virus")) {
    specialty = "infectious-disease";
  }

  return {
    type,
    specialty,
    specialties: [specialty],
    tags: [],
  };
}
