// utils/html.js — ✅ ИСПРАВЛЕНО: module.exports → export (проект на ESM)
import * as cheerio from "cheerio";

export function stripHtml(html = "") {
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}
