export function detectType(text) {
  const lower = text.toLowerCase();

  if (
    lower.includes("study") ||
    lower.includes("trial") ||
    lower.includes("meta-analysis") ||
    lower.includes("randomized")
  ) {
    return "research";
  }

  return "news";
}
