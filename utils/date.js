// utils/date.js — ✅ ИСПРАВЛЕНО: module.exports → export (проект на ESM)
export function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function nowISO() {
  return new Date().toISOString();
}
