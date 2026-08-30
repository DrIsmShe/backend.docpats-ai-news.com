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

  // ── ЕВРОПА: остальные специальности ────────────────────────
  // Часть обществ держит анонс ближайшего конгресса на главной, а
  // отдельной страницы «Events» у них нет — тогда указан корень сайта.
  { name: "EULAR (ревматология)", slug: "eular", eventsUrl: "https://www.eular.org/", domain: "eular.org", country: "", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "ESCMID (инфекции и микробиология)", slug: "escmid", eventsUrl: "https://www.escmid.org/", domain: "escmid.org", country: "", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "UEG (гастроэнтерология)", slug: "ueg", eventsUrl: "https://ueg.eu/", domain: "ueg.eu", country: "", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "ESCRS (офтальмохирургия)", slug: "escrs", eventsUrl: "https://www.escrs.org/meetings-and-events/event-search", domain: "escrs.org", country: "", trust: "high", categories: ["ophthalmology-ent"], isActive: true },
  { name: "ESE (эндокринология)", slug: "ese", eventsUrl: "https://www.ese-hormones.org/", domain: "ese-hormones.org", country: "", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "EPA (психиатрия)", slug: "epa", eventsUrl: "https://www.europsy.net/", domain: "europsy.net", country: "", trust: "high", categories: ["mental-health"], isActive: true },
  { name: "EACTS (кардиоторакальная хирургия)", slug: "eacts", eventsUrl: "https://www.eacts.org/", domain: "eacts.org", country: "", trust: "high", categories: ["surgical"], isActive: true },
  { name: "EAACI (аллергология)", slug: "eaaci", eventsUrl: "https://eaaci.org/events/", domain: "eaaci.org", country: "", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "EADV (дерматология)", slug: "eadv", eventsUrl: "https://eadv.org/events/", domain: "eadv.org", country: "", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "EAP (педиатрия)", slug: "eap", eventsUrl: "https://eapaediatrics.eu/events/", domain: "eapaediatrics.eu", country: "", trust: "high", categories: ["pediatrics"], isActive: true },
  { name: "EFORT (ортопедия и травматология)", slug: "efort", eventsUrl: "https://www.efort.org/", domain: "efort.org", country: "", trust: "high", categories: ["surgical"], isActive: true },
  { name: "EHA (гематология)", slug: "eha", eventsUrl: "https://ehaweb.org/", domain: "ehaweb.org", country: "", trust: "high", categories: ["oncology", "therapeutic"], isActive: true },
  { name: "ESAIC (анестезиология)", slug: "esaic", eventsUrl: "https://esaic.org/events/", domain: "esaic.org", country: "", trust: "high", categories: ["surgical", "emergency"], isActive: true },
  { name: "ESICM (интенсивная терапия)", slug: "esicm", eventsUrl: "https://www.esicm.org/", domain: "esicm.org", country: "", trust: "high", categories: ["emergency"], isActive: true },
  { name: "ESTRO (лучевая терапия)", slug: "estro", eventsUrl: "https://www.estro.org/Congresses", domain: "estro.org", country: "", trust: "high", categories: ["oncology"], isActive: true },
  { name: "ESH (артериальная гипертензия)", slug: "esh", eventsUrl: "https://www.eshonline.org/", domain: "eshonline.org", country: "", trust: "high", categories: ["therapeutic"], isActive: true },

  // ── ТУРЦИЯ ─────────────────────────────────────────────────
  // Ближайший к нашей аудитории регион: до Стамбула и Анталии врач из Баку
  // доедет, а до Чикаго — нет. Сайты национальных обществ, не агрегаторы.
  { name: "Türk Kardiyoloji Derneği", slug: "tkd", eventsUrl: "https://tkd.org.tr/", domain: "tkd.org.tr", country: "TR", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "Türk Toraks Derneği", slug: "toraks", eventsUrl: "https://www.toraks.org.tr/", domain: "toraks.org.tr", country: "TR", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "Türkiye Fiziksel Tıp ve Rehabilitasyon Derneği", slug: "tftr", eventsUrl: "https://www.tftr.org.tr/kongre-takvimi", domain: "tftr.org.tr", country: "TR", trust: "high", categories: ["rehabilitation"], isActive: true },
  { name: "Türk Radyoloji Derneği", slug: "turkrad", eventsUrl: "https://www.turkrad.org.tr/", domain: "turkrad.org.tr", country: "TR", trust: "high", categories: ["diagnostics"], isActive: true },

  // ── АЗЕРБАЙДЖАН ────────────────────────────────────────────
  // Пока один источник, и это честно: национальных обществ с постоянной
  // страницей анонсов в открытом вебе мало. Остальное придётся заводить
  // вручную — форма для этого и сделана.
  { name: "Azərbaycan Minimal İnvaziv Cərrahlar Cəmiyyəti", slug: "amicc", eventsUrl: "https://amicc.az/", domain: "amicc.az", country: "AZ", trust: "high", categories: ["surgical"], isActive: true },

  // ── РОССИЯ И СНГ ───────────────────────────────────────────
  { name: "Российское кардиологическое общество", slug: "scardio", eventsUrl: "https://scardio.ru/", domain: "scardio.ru", country: "RU", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "Ассоциация онкологов России", slug: "rusonco", eventsUrl: "https://oncology-association.ru/", domain: "oncology-association.ru", country: "RU", trust: "high", categories: ["oncology"], isActive: true },
  { name: "РАСУДМ (ультразвуковая диагностика)", slug: "rasudm", eventsUrl: "https://rasudm.org/", domain: "rasudm.org", country: "RU", trust: "high", categories: ["diagnostics"], isActive: true },
  { name: "МАКМАХ (антимикробная химиотерапия)", slug: "iacmac", eventsUrl: "https://www.antibiotic.ru/", domain: "antibiotic.ru", country: "RU", trust: "high", categories: ["therapeutic"], isActive: true },

  // ── ИНДИЯ ──────────────────────────────────────────────────
  { name: "Cardiological Society of India", slug: "csi-in", eventsUrl: "https://csi.org.in/", domain: "csi.org.in", country: "IN", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "Indian Radiological & Imaging Association", slug: "iria", eventsUrl: "https://iria.org.in/", domain: "iria.org.in", country: "IN", trust: "high", categories: ["diagnostics"], isActive: true },
  { name: "Association of Physicians of India", slug: "api-in", eventsUrl: "https://www.apiindia.org/", domain: "apiindia.org", country: "IN", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "Indian Academy of Pediatrics", slug: "iap-in", eventsUrl: "https://iapindia.org/", domain: "iapindia.org", country: "IN", trust: "high", categories: ["pediatrics"], isActive: true },

  // ── КИТАЙ ──────────────────────────────────────────────────
  { name: "Chinese Medical Association", slug: "cma-cn", eventsUrl: "https://www.cma.org.cn/", domain: "cma.org.cn", country: "CN", trust: "high", categories: [], isActive: true },

  // ── МЕЖДУНАРОДНЫЕ ──────────────────────────────────────────
  { name: "WONCA (семейная медицина)", slug: "wonca", eventsUrl: "https://www.globalfamilydoctor.com/", domain: "globalfamilydoctor.com", country: "", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "ISN (нефрология)", slug: "isn", eventsUrl: "https://www.theisn.org/events/", domain: "theisn.org", country: "", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "World Psychiatric Association", slug: "wpa", eventsUrl: "https://www.wpanet.org/", domain: "wpanet.org", country: "", trust: "high", categories: ["mental-health"], isActive: true },
  { name: "FDI World Dental Federation", slug: "fdi", eventsUrl: "https://www.fdiworlddental.org/", domain: "fdiworlddental.org", country: "", trust: "high", categories: ["dentistry"], isActive: true },

  // ── США ────────────────────────────────────────────────────
  // Далеко и дорого, но именно там объявляют исследования, о которых потом
  // спрашивают пациенты. Онлайн-формат делает их доступными.
  { name: "American Academy of Dermatology", slug: "aad", eventsUrl: "https://www.aad.org/member/meetings-education", domain: "aad.org", country: "US", trust: "high", categories: ["therapeutic"], isActive: true },
  { name: "American Society of Anesthesiologists", slug: "asa-us", eventsUrl: "https://www.asahq.org/meetings", domain: "asahq.org", country: "US", trust: "high", categories: ["surgical", "emergency"], isActive: true },
  { name: "American Society of Hematology", slug: "ash-us", eventsUrl: "https://www.hematology.org/meetings", domain: "hematology.org", country: "US", trust: "high", categories: ["oncology", "therapeutic"], isActive: true },
  { name: "Society of Critical Care Medicine", slug: "sccm", eventsUrl: "https://www.sccm.org/education-center/conference-calendar", domain: "sccm.org", country: "US", trust: "high", categories: ["emergency"], isActive: true },
  { name: "American Academy of Ophthalmology", slug: "aao", eventsUrl: "https://www.aao.org/annual-meeting", domain: "aao.org", country: "US", trust: "high", categories: ["ophthalmology-ent"], isActive: true },
  { name: "American Academy of Pediatrics", slug: "aap-us", eventsUrl: "https://www.aap.org/", domain: "aap.org", country: "US", trust: "high", categories: ["pediatrics"], isActive: true },
  { name: "ACOG (акушерство и гинекология)", slug: "acog", eventsUrl: "https://www.acog.org/", domain: "acog.org", country: "US", trust: "high", categories: ["womens-health"], isActive: true },

  // ── ЗАКРЫВАЕМ ПУСТЫЕ НАПРАВЛЕНИЯ ───────────────────────────
  // В админке эти направления показывались как «нет ни одной конференции».
  // Мир тут ни при чём: у нас просто не было источников — по спортивной
  // медицине и фармации ни одного, а стоматологию и офтальмологию
  // представляли корневые страницы обществ без списка мероприятий.
  { name: "American College of Sports Medicine", slug: "acsm", eventsUrl: "https://acsm.org/meetings/", domain: "acsm.org", country: "US", trust: "high", categories: ["sports-medicine"], isActive: true },
  { name: "ESSKA (спортивная травматология)", slug: "esska", eventsUrl: "https://www.esska.org/events/event_list.asp", domain: "esska.org", country: "", trust: "high", categories: ["sports-medicine", "surgical"], isActive: true },
  { name: "EAHP (госпитальная фармация)", slug: "eahp", eventsUrl: "https://eahp.eu/events-1/", domain: "eahp.eu", country: "", trust: "high", categories: ["pharmacy"], isActive: true },
  { name: "FIP (международная фармацевтическая федерация)", slug: "fip", eventsUrl: "https://www.fip.org/congresses", domain: "fip.org", country: "", trust: "high", categories: ["pharmacy"], isActive: true },
  { name: "FDI World Dental Congress", slug: "fdi-congress", eventsUrl: "https://world-dental-congress.org/", domain: "world-dental-congress.org", country: "", trust: "high", categories: ["dentistry"], isActive: true },
  { name: "IFOS (оториноларингология)", slug: "ifos", eventsUrl: "https://ifosworld.org/", domain: "ifosworld.org", country: "", trust: "high", categories: ["ophthalmology-ent"], isActive: true },
];
