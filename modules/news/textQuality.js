// modules/news/textQuality.js
//
// Является ли извлечённый текст статьёй — и если да, где у него края.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ МОДУЛЕМ. Проверка «текста больше 500 знаков» ловит не то.
// Живой пример из ленты, материал STAT на 1773 знака, который формально
// проходил порог и показывался как полная статья:
//
//   [0]    Adam Feuerstein is a senior writer and biotech columnist…
//          This story first appeared in a subscriber-only newsletter.
//   [450]  A drug for a rare disease is evaluated in a small clinical trial…
//          ← настоящий текст, ровно один вводный абзац
//   [1230] To read the rest of this story subscribe to STAT+.
//          ← платная стена: дальше статьи нет
//   [1350] Adam Feuerstein is a senior writer… (снова)
//          Your data will be processed in accordance with our Privacy Policy.
//
// То есть три четверти «статьи» — биография автора и форма подписки, а сам
// материал оборван на первом абзаце. Длина при этом набирается.
//
// Отсюда две разные проверки, и путать их нельзя:
//   isTruncated  — текст ОБОРВАН платной стеной, полного нет и не будет;
//   stripBoilerplate — текст полный, но по краям налипли служебные блоки.

/**
 * Явные признаки того, что дальше текста нет — стоит платная стена.
 *
 * Ищем именно ПРИЗЫВ дочитать по подписке, а не слово «subscribe»: последнее
 * встречается в подвале и у совершенно открытых статей, и по нему мы выкинули
 * бы сотню нормальных материалов.
 */
const PAYWALL = [
  /To read the rest of this (story|article),? subscribe/i,
  /subscribe to continue reading/i,
  /this (content|article) is (only )?for subscribers/i,
  /unlock this article/i,
  /continue reading with a subscription/i,
];

/** Оборван ли текст платной стеной. */
export function isTruncated(text) {
  const value = String(text || "");
  return PAYWALL.some((re) => re.test(value));
}

/**
 * Служебные блоки, налипающие по краям статьи.
 *
 * Извлекатель берёт крупный блок страницы целиком, и вместе с текстом в него
 * попадают карточка автора сверху и форма подписки снизу. Для чтения это шум,
 * а для поиска и для модели — ещё и ложный контекст: биография журналиста не
 * имеет отношения к медицинскому содержанию.
 */
const TAIL_MARKERS = [
  /Your data will be processed in accordance with/i,
  /You may opt out of receiving/i,
  /Sign up for .{0,40}newsletter/i,
];

// Карточка автора в начале: «Имя Фамилия is a senior writer…», «Chen has
// covered cancer for five years…». Режем только если она стоит В САМОМ НАЧАЛЕ
// и коротка: в середине текста такая фраза может быть частью материала.
const LEAD_BIO =
  /^.{0,400}?(is a (senior )?(writer|reporter|correspondent|columnist|editor)|has covered|covers how)\b.{0,400}?\.\s+/s;

/**
 * Убирает служебные блоки по краям, оставляя сам материал.
 *
 * Ничего не выдумывает и не сокращает текст статьи — только отсекает то, что
 * приклеилось снаружи.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripBoilerplate(text) {
  let value = String(text || "");

  // Хвост: всё от формы подписки и ниже.
  for (const re of TAIL_MARKERS) {
    const at = value.search(re);
    if (at > 0) value = value.slice(0, at);
  }

  // Шапка с биографией — только если после неё остаётся связный материал.
  const withoutBio = value.replace(LEAD_BIO, "");
  if (withoutBio.length >= 400) value = withoutBio;

  return value.trim();
}

/**
 * Годится ли материал для ленты.
 *
 * @param {string} text
 * @param {number} minLength
 * @returns {{ok: boolean, reason: string, text: string}}
 */
export function assessArticleText(text, minLength = 500) {
  const raw = String(text || "").trim();

  // Порядок важен: сначала стена. Оборванный текст бывает длинным, и после
  // очистки краёв он всё равно останется оборванным — просто аккуратнее.
  if (isTruncated(raw)) {
    return { ok: false, reason: "paywalled", text: raw };
  }

  const cleaned = stripBoilerplate(raw);
  if (cleaned.length < minLength) {
    return { ok: false, reason: "too_short", text: cleaned };
  }

  return { ok: true, reason: "", text: cleaned };
}

export default { isTruncated, stripBoilerplate, assessArticleText };
