import Anthropic from "@anthropic-ai/sdk";
import NewsItem from "../news/news.model.js";
import Synthesis from "./synthesis.model.js";
import { translateAllLocales } from "./synthesis.controller.js";

const client = new Anthropic();

// ─── ВСЕ МЕДИЦИНСКИЕ И НАУЧНЫЕ ОБЛАСТИ ───────────────────────
const SPECIALTY_MAP = {
  // Клинические специальности
  cardiology: "Кардиология",
  oncology: "Онкология",
  neurology: "Неврология",
  neurosurgery: "Нейрохирургия",
  psychiatry: "Психиатрия",
  psychology: "Психология",
  endocrinology: "Эндокринология",
  diabetology: "Диабетология",
  infectious: "Инфекционные болезни",
  surgery: "Хирургия",
  orthopedics: "Ортопедия",
  traumatology: "Травматология",
  pulmonology: "Пульмонология",
  gastroenterology: "Гастроэнтерология",
  hepatology: "Гепатология",
  nephrology: "Нефрология",
  urology: "Урология",
  gynecology: "Гинекология",
  obstetrics: "Акушерство",
  pediatrics: "Педиатрия",
  neonatology: "Неонатология",
  geriatrics: "Гериатрия",
  dermatology: "Дерматология",
  ophthalmology: "Офтальмология",
  otolaryngology: "Оториноларингология",
  dentistry: "Стоматология",
  rheumatology: "Ревматология",
  hematology: "Гематология",
  immunology: "Иммунология",
  allergology: "Аллергология",
  radiology: "Радиология",
  radiotherapy: "Радиотерапия",
  anesthesiology: "Анестезиология",
  intensive_care: "Интенсивная терапия",
  emergency: "Экстренная медицина",
  sports_medicine: "Спортивная медицина",
  rehabilitation: "Реабилитология",
  palliative: "Паллиативная медицина",
  pain_medicine: "Медицина боли",
  sleep_medicine: "Сомнология",
  addiction: "Наркология",
  vascular: "Сосудистая хирургия",
  cardiac_surgery: "Кардиохирургия",
  transplantology: "Трансплантология",
  plastic_surgery: "Пластическая хирургия",

  // Фундаментальные науки
  genetics: "Генетика",
  genomics: "Геномика",
  proteomics: "Протеомика",
  metabolomics: "Метаболомика",
  epigenetics: "Эпигенетика",
  molecular_biology: "Молекулярная биология",
  cell_biology: "Клеточная биология",
  biochemistry: "Биохимия",
  microbiology: "Микробиология",
  virology: "Вирусология",
  bacteriology: "Бактериология",
  mycology: "Микология",
  parasitology: "Паразитология",
  immunobiology: "Иммунобиология",
  neuroscience: "Нейронауки",
  pharmacology: "Фармакология",
  toxicology: "Токсикология",
  pathology: "Патология",
  anatomy: "Анатомия",
  physiology: "Физиология",
  biophysics: "Биофизика",
  biostatistics: "Биостатистика",

  // Прикладные науки и технологии
  bioinformatics: "Биоинформатика",
  bioengineering: "Биоинженерия",
  biotechnology: "Биотехнология",
  nanotechnology: "Нанотехнологии в медицине",
  ai_medicine: "Искусственный интеллект в медицине",
  telemedicine: "Телемедицина",
  medical_devices: "Медицинские технологии",
  drug_development: "Разработка лекарств",
  clinical_trials: "Клинические исследования",
  precision_medicine: "Прецизионная медицина",
  regenerative: "Регенеративная медицина",
  stem_cells: "Стволовые клетки",
  gene_therapy: "Генная терапия",
  immunotherapy: "Иммунотерапия",
  microbiome: "Микробиом",

  // Эпидемиология и общественное здравоохранение
  epidemiology: "Эпидемиология",
  public_health: "Общественное здравоохранение",
  global_health: "Глобальное здравоохранение",
  environmental: "Экологическая медицина",
  occupational: "Профессиональная медицина",
  nutrition: "Нутрициология",
  preventive: "Профилактическая медицина",
  vaccinology: "Вакцинология",

  // Смежные науки
  neuropharmacology: "Нейрофармакология",
  psychopharmacology: "Психофармакология",
  cardiovascular: "Сердечно-сосудистые заболевания",
  autoimmune: "Аутоиммунные заболевания",
  rare_diseases: "Редкие заболевания",
  aging: "Биология старения",
  longevity: "Долголетие",
  cancer_biology: "Биология рака",
  neurodegeneration: "Нейродегенерация",
  mental_health: "Психическое здоровье",
  general: "Общая медицина",
};

// ─── СТИЛИ С ПОДСТИЛЯМИ ────────────────────────────────────────
const ARTICLE_STYLES = [
  {
    name: "analytical_comparative",
    group: "Аналитический",
    instruction: `в строгом аналитическом стиле с детальным сравнением данных из разных источников. 
    Сопоставь методологии, выяви расхождения в результатах, дай взвешенную экспертную оценку. 
    Используй таблицы сравнения (в тексте), конкретные числа, p-значения, доверительные интервалы где уместно.`,
  },
  {
    name: "analytical_critical",
    group: "Аналитический",
    instruction: `в критически-аналитическом стиле: подвергни сомнению устоявшиеся взгляды, 
    найди слабые места в методологии источников, покажи где доказательная база недостаточна. 
    Пиши как рецензент ведущего журнала — строго, но конструктивно.`,
  },
  {
    name: "analytical_mechanistic",
    group: "Аналитический",
    instruction: `с глубоким погружением в механизмы: молекулярные пути, патофизиологические каскады, 
    биохимические взаимодействия. Объясни "почему" и "как", а не только "что". 
    Целевая аудитория — исследователи и специалисты.`,
  },
  {
    name: "clinical_practical",
    group: "Клинический",
    instruction: `в практическом клиническом стиле для врачей у постели больного: 
    что изменится в диагностике, какие протоколы пересмотреть, конкретные алгоритмы действий. 
    Формат близкий к клиническим рекомендациям — чёткий, структурированный, actionable.`,
  },
  {
    name: "clinical_case_based",
    group: "Клинический",
    instruction: `через призму клинических случаев и примеров: начни с гипотетического типичного пациента, 
    разбери как новые данные меняют его диагностику и лечение. 
    Чередуй клинический нарратив с научным анализом.`,
  },
  {
    name: "clinical_guidelines",
    group: "Клинический",
    instruction: `в формате обновления клинических рекомендаций: что изменилось по сравнению с прежними 
    стандартами, какие новые данные требуют пересмотра протоколов, 
    какие вопросы остаются дискуссионными среди клиницистов.`,
  },
  {
    name: "popular_storytelling",
    group: "Научно-популярный",
    instruction: `в жанре narrative science — через историю: начни с реального человека, 
    загадки природы или парадокса, постепенно раскрывая науку. 
    Пиши как для New Yorker или Nautilus — интеллектуально, образно, захватывающе.`,
  },
  {
    name: "popular_explainer",
    group: "Научно-популярный",
    instruction: `в формате глубокого explainer'а для образованного читателя без медицинского фона: 
    используй яркие аналогии, неожиданные сравнения, визуальные описания процессов. 
    Цель — настоящее понимание, а не упрощение.`,
  },
  {
    name: "popular_discovery",
    group: "Научно-популярный",
    instruction: `в жанре "научного открытия": расскажи историю как учёные пришли к этому, 
    какие были тупики и прорывы, что это значит для человечества. 
    Тон — восхищение и интеллектуальное возбуждение от науки.`,
  },
  {
    name: "investigative",
    group: "Журналистский",
    instruction: `в investigative journalism стиле: копай глубже официальных выводов, 
    задавай неудобные вопросы о финансировании, конфликтах интересов, воспроизводимости. 
    Что за этими данными скрывается? Кто выигрывает, кто проигрывает?`,
  },
  {
    name: "policy_analysis",
    group: "Журналистский",
    instruction: `через призму политики здравоохранения и общества: 
    как эти данные должны изменить законодательство, финансирование, систему здравоохранения. 
    Анализ барьеров внедрения, экономических последствий, неравенства доступа.`,
  },
  {
    name: "patient_perspective",
    group: "Журналистский",
    instruction: `с позиции пациента и общества: что эти открытия означают для людей с этим заболеванием, 
    как меняется прогноз, качество жизни, надежда. 
    Эмпатичный, но научно строгий тон.`,
  },
  {
    name: "controversy",
    group: "Журналистский",
    instruction: `в формате "научной контроверзы": представь обе стороны дискуссии максимально честно, 
    покажи где эксперты расходятся и почему, дай читателю инструменты для собственного суждения. 
    Без преждевременных выводов.`,
  },
  {
    name: "systematic_review",
    group: "Обзорный",
    instruction: `в формате систематического обзора: методология отбора источников, 
    качество доказательной базы, синтез результатов, гетерогенность данных, 
    направления будущих исследований. Строго академический тон.`,
  },
  {
    name: "state_of_the_art",
    group: "Обзорный",
    instruction: `в формате "state of the art" — срез современного знания в области: 
    что мы знаем точно, что под вопросом, что только начинаем понимать. 
    Ориентир для исследователей входящих в тему.`,
  },
  {
    name: "historical_evolution",
    group: "Обзорный",
    instruction: `через историческую эволюцию знаний: как понимание этой проблемы менялось 
    за последние десятилетия, какие парадигмы рухнули, что осталось незыблемым, 
    как текущие данные вписываются в эту эволюцию.`,
  },
  {
    name: "bench_to_bedside",
    group: "Трансляционный",
    instruction: `в трансляционном ключе "от скамьи к постели": как фундаментальные открытия 
    превращаются в клиническую практику, какие этапы впереди, 
    какие барьеры стоят на пути от лаборатории к пациенту.`,
  },
  {
    name: "future_medicine",
    group: "Трансляционный",
    instruction: `футуристический взгляд на медицину через призму текущих данных: 
    куда ведут эти открытия через 5-10-20 лет, какие технологии они откроют, 
    как изменится медицина. Обоснованная экстраполяция, а не фантастика.`,
  },
  {
    name: "teaching_review",
    group: "Образовательный",
    instruction: `в формате обучающего обзора для студентов и ординаторов: 
    начни с базовых концепций, последовательно наращивай сложность, 
    объясни почему это важно понимать. Педагогически структурированный текст с ключевыми выводами.`,
  },
  {
    name: "grand_rounds",
    group: "Образовательный",
    instruction: `в формате "grand rounds" — академической презентации для медицинской аудитории: 
    строгая структура, клинически значимые выводы, дискуссионные вопросы в конце каждого раздела. 
    Тон — коллега представляет коллегам.`,
  },
  {
    name: "bioethics",
    group: "Этический",
    instruction: `через биоэтическую призму: какие этические вопросы поднимают эти данные, 
    права пациентов, справедливость доступа, границы вмешательства в природу человека. 
    Философски глубокий, но практически ориентированный.`,
  },
  {
    name: "health_equity",
    group: "Этический",
    instruction: `через призму равенства в здоровье: как эти данные влияют на разные 
    популяции, группы риска, экономически уязвимых. 
    Где неравенство усиливается, где можно его преодолеть.`,
  },
  {
    name: "health_economics",
    group: "Экономический",
    instruction: `с позиции экономики здравоохранения: 
    стоимость-эффективность новых подходов, нагрузка на систему здравоохранения, 
    экономические последствия болезни и её лечения. Данные и расчёты.`,
  },
  {
    name: "interdisciplinary",
    group: "Междисциплинарный",
    instruction: `на пересечении дисциплин: как эта медицинская проблема связана с физикой, 
    химией, информатикой, социологией, эволюционной биологией. 
    Неожиданные связи и инсайты из смежных областей.`,
  },
  {
    name: "one_health",
    group: "Междисциплинарный",
    instruction: `в концепции One Health — единства здоровья человека, животных и экосистем: 
    как эта медицинская проблема связана с ветеринарией, экологией, 
    изменением климата и продовольственными системами.`,
  },
];

let styleIndex = 0;

function normalizeAuthors(authors) {
  if (!authors) return "";
  if (Array.isArray(authors)) return authors.join(", ");
  return String(authors);
}

function groupBySpecialty(items, maxGroups) {
  const map = {};
  for (const item of items) {
    const raw = item.category || item.specialty || "general";
    const key = SPECIALTY_MAP[raw] || raw;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }

  return Object.entries(map)
    .sort((a, b) => b[1].length - a[1].length + (Math.random() * 2 - 1))
    .slice(0, maxGroups)
    .map(([specialty, articles]) => ({
      specialty,
      articles: articles.sort(() => Math.random() - 0.5).slice(0, 6),
    }));
}

async function generateAndSave(specialty, articles) {
  const style = ARTICLE_STYLES[styleIndex % ARTICLE_STYLES.length];
  styleIndex++;

  const angles = [
    "с фокусом на последние клинические данные и их немедленное практическое значение",
    "через молекулярные механизмы и патофизиологические каскады",
    "через призму глобального здравоохранения и межпопуляционных различий",
    "с анализом противоречий и методологических ограничений исследований",
    "через перспективы терапевтических мишеней и будущих исследований",
    "с позиции доказательной медицины и иерархии доказательств",
    "через взаимодействие генетических, средовых и поведенческих факторов",
    "в контексте эволюционной биологии и адаптационных механизмов",
    "через призму системной биологии и сетевых взаимодействий",
    "с акцентом на биомаркеры и инструменты персонализированной медицины",
    "через анализ неудач и отрицательных результатов в области",
    "в контексте глобального бремени болезни и экономических последствий",
  ];
  const angle = angles[Math.floor(Math.random() * angles.length)];

  const sourcesText = articles
    .map((a, i) =>
      `
[${i + 1}] "${a.title}"
URL: ${a.url || a.link || "-"}
Авторы: ${normalizeAuthors(a.authors) || "не указаны"}
${a.description ? "Аннотация: " + a.description.slice(0, 500) : ""}
`.trim(),
    )
    .join("\n\n");

  const prompt = `Ты — ведущий медицинский редактор и учёный с 20-летним стажем, 
автор более 200 рецензируемых статей, постоянный автор The Lancet и NEJM.

Напиши глубокую оригинальную аналитическую статью на русском языке.

СТИЛЬ: ${style.group} — ${style.instruction}

Область: ${specialty}
Угол: ${angle}
ОБЯЗАТЕЛЬНЫЙ объём: строго не менее 5000 слов.

ИСТОЧНИКИ:
${sourcesText}

ТРЕБОВАНИЯ:
1. Минимум 5000 слов — продолжай если не достиг
2. Синтез источников в единый нарратив с собственной авторской позицией
3. Конкретные данные, цифры, механизмы из источников
4. Разнообразный синтаксис — длинные и короткие предложения, риторические вопросы
5. Запрещены шаблоны: "следует отметить", "таким образом", "в заключение следует сказать", "данная работа"
6. Не упоминай ИИ
7. Заголовок — яркий, конкретный, интригующий, не банальный
8. В конце каждого раздела добавь блок 'Что это значит для пациента:' в 2-3 предложения простым языком

СТРУКТУРА:
# [Заголовок]
[Введение — 600-700 слов]
## [Раздел 1] — 900-1000 слов
## [Раздел 2] — 900-1000 слов
## [Раздел 3] — 900-1000 слов
## [Раздел 4] — 700-800 слов
## [Раздел 5] — 600-700 слов
## Заключение — 400-500 слов
## Литература
[1] Авторы. Название. Издание. Год. URL

## Об этом материале
Материал подготовлен редакцией DocPats на основе рецензируемых научных источников: PubMed, The Lancet, PLOS Medicine, CDC, WHO и других ведущих медицинских изданий. Прошёл редакционную проверку DocPats под руководством главного редактора — Д-ра Исмаила Исмаилова, практикующего оториноларинголога.

*Материал носит информационный характер и не заменяет консультацию специалиста.*

Начни с # заголовка:`;

  console.log(`[Synthesis] "${specialty}" | ${style.group} → ${style.name}`);

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  if (!message.content || !message.content[0] || !message.content[0].text) {
    throw new Error(`Пустой ответ от API для "${specialty}"`);
  }

  const body = message.content[0].text;
  const titleMatch = body.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : `Обзор: ${specialty}`;
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  const saved = await Synthesis.create({
    title,
    body,
    specialty,
    language: "ru",
    wordCount,
    style: style.name,
    author: "Доктор Исмаил",
    sources: articles.map((a) => ({
      title: a.title,
      url: a.url || a.link,
      authors: normalizeAuthors(a.authors),
      year: new Date(a.publishedAt || a.createdAt || Date.now()).getFullYear(),
    })),
  });

  console.log(
    `[Synthesis] ✓ "${title}" — ${wordCount} слов | id: ${saved._id}`,
  );

  // ── Запускаем фоновый перевод на EN, AZ, TR, AR — без await ──
  // Переводы готовятся параллельно пока сервер обслуживает другие запросы.
  // К моменту прихода первых читателей (обычно через 10+ мин) всё будет в кэше.
  translateAllLocales(saved).catch((err) =>
    console.error("[Synthesis] Background translate error:", err.message),
  );

  return saved;
}

export async function runSynthesis({ hoursBack = 12, maxGroups = 1 } = {}) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const items = await NewsItem.find({ createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  if (items.length < 3) {
    console.log("[Synthesis] Мало новостей:", items.length);
    return { generated: 0 };
  }

  const groups = groupBySpecialty(items, maxGroups);
  let generated = 0;

  for (const { specialty, articles } of groups) {
    const exists = await Synthesis.findOne({
      specialty,
      createdAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    });
    if (exists) {
      console.log(`[Synthesis] Пропускаем "${specialty}" — уже есть за 6ч`);
      continue;
    }

    try {
      await generateAndSave(specialty, articles);
      generated++;
    } catch (err) {
      console.error(`[Synthesis] Ошибка "${specialty}":`, err.message);
    }
  }

  return { generated };
}
