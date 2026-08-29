// Источники конференций — КУРИРУЕМЫЙ список, а не поисковый запрос.
//
// Свободный веб-поиск сюда приносит хищнические конференции: OMICS, WASET и
// их клоны рассылают врачам приглашения на мероприятия, которых нет, и по
// тексту страницы выглядят убедительнее настоящих. Модель их не отличает.
// Отличает происхождение: страница «Events» на сайте самого общества.
//
// `domain` — это ещё и белый список для validateDraft(). Ссылка на карточке,
// которая ведёт за пределы этих доменов, помечается флагом
// `untrusted_domain` и попадает к модератору с предупреждением.
//
// `trust` пока ни на что не влияет: публикует человек в любом случае. Поле
// заведено под будущее правило «источникам high — автопубликация», и до
// него надо сначала дожить на живой очереди.
//
// `categories` — подсказка, а не приговор: чем занимается общество. Модель
// может выставить свои, но если она молчит, берём эти.

export default [
  // ── КАРДИОЛОГИЯ ────────────────────────────────────────────
  {
    name: "European Society of Cardiology",
    slug: "esc",
    eventsUrl: "https://www.escardio.org/events/",
    domain: "escardio.org",
    country: "",
    trust: "high",
    categories: ["therapeutic"],
    isActive: true,
  },
  {
    name: "American College of Cardiology",
    slug: "acc",
    eventsUrl: "https://www.acc.org/Education-and-Meetings",
    domain: "acc.org",
    country: "US",
    trust: "high",
    categories: ["therapeutic"],
    isActive: true,
  },

  // ── ОНКОЛОГИЯ ──────────────────────────────────────────────
  {
    name: "European Society for Medical Oncology",
    slug: "esmo",
    eventsUrl: "https://www.esmo.org/about-esmo-meetings",
    domain: "esmo.org",
    country: "",
    trust: "high",
    categories: ["oncology"],
    isActive: true,
  },
  {
    name: "American Society of Clinical Oncology",
    slug: "asco",
    eventsUrl: "https://www.asco.org/meetings-education",
    domain: "asco.org",
    country: "US",
    trust: "high",
    categories: ["oncology"],
    isActive: true,
  },

  // ── ДИАГНОСТИКА ────────────────────────────────────────────
  {
    name: "Radiological Society of North America",
    slug: "rsna",
    eventsUrl: "https://www.rsna.org/annual-meeting",
    domain: "rsna.org",
    country: "US",
    trust: "high",
    categories: ["diagnostics"],
    isActive: true,
  },
  {
    name: "European Society of Radiology",
    slug: "esr",
    eventsUrl: "https://www.myesr.org/congress/",
    domain: "myesr.org",
    country: "AT",
    trust: "high",
    categories: ["diagnostics"],
    isActive: true,
  },

  // ── ТЕРАПЕВТИЧЕСКИЕ ────────────────────────────────────────
  {
    name: "European Respiratory Society",
    slug: "ers",
    eventsUrl: "https://www.ersnet.org/congress-and-events/",
    domain: "ersnet.org",
    country: "",
    trust: "high",
    categories: ["therapeutic"],
    isActive: true,
  },
  {
    name: "European Association for the Study of Diabetes",
    slug: "easd",
    eventsUrl: "https://www.easd.org/annual-meeting.html",
    domain: "easd.org",
    country: "",
    trust: "high",
    categories: ["therapeutic"],
    isActive: true,
  },
  {
    name: "European Academy of Neurology",
    slug: "ean",
    eventsUrl: "https://www.ean.org/congress2026",
    domain: "ean.org",
    country: "",
    trust: "high",
    categories: ["therapeutic"],
    isActive: true,
  },

  // ── ХИРУРГИЯ И УРОЛОГИЯ ────────────────────────────────────
  {
    name: "European Association of Urology",
    slug: "eau",
    eventsUrl: "https://uroweb.org/education-events/events",
    domain: "uroweb.org",
    country: "NL",
    trust: "high",
    categories: ["surgical", "mens-health"],
    isActive: true,
  },
  {
    name: "American College of Surgeons",
    slug: "acs",
    eventsUrl: "https://www.facs.org/for-medical-professionals/education/",
    domain: "facs.org",
    country: "US",
    trust: "high",
    categories: ["surgical"],
    isActive: true,
  },

  // ── ЖЕНСКОЕ ЗДОРОВЬЕ ───────────────────────────────────────
  {
    name: "European Society of Human Reproduction and Embryology",
    slug: "eshre",
    eventsUrl: "https://www.eshre.eu/Annual-Meeting",
    domain: "eshre.eu",
    country: "BE",
    trust: "high",
    categories: ["womens-health"],
    isActive: true,
  },
];
