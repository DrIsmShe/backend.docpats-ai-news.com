// utils/logger.js — ✅ ИСПРАВЛЕНО: module.exports → export (проект на ESM)
export function logInfo(...args) {
  console.log("ℹ️", ...args);
}

export function logSuccess(...args) {
  console.log("✅", ...args);
}

export function logWarn(...args) {
  console.warn("⚠️", ...args);
}

export function logError(...args) {
  console.error("❌", ...args);
}
