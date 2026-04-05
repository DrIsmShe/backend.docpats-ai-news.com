import OpenAI from "openai";

// Клиент создаётся лениво — только при первом вызове classifyWithAI
let _openai = null;
function getClient() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) return null;
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function classifyWithAI(text) {
  const client = getClient();
  if (!client) {
    console.warn(
      "[classifyWithAI] No OPENAI_API_KEY, falling back to keywords",
    );
    return null;
  }
  const prompt = `Classify this medical article.

Return JSON only, no markdown:

{
  "type": "news or research",
  "specialty": "one of: cardiology | oncology | neurology | infectious | surgery | endocrinology | pulmonology | gastroenterology | psychiatry | pediatrics | gynecology | orthopedics | ophthalmology | ent | urology | dermatology | nephrology | hematology | rheumatology | radiology | anesthesiology | rehabilitation | dentistry | genetics | sports_medicine | emergency | allergy | general"
}

Text:
${text}
`;
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error("[classifyWithAI] error:", err.message);
    return null;
  }
}

// ─── SOURCE-BASED TYPE DETECTION ─────────────────────────────────────────────
const RESEARCH_SOURCES = [
  "nature",
  "nature-medicine",
  "science-magazine",
  "thelancet",
  "nejm",
  "bmj",
  "pubmed",
  "jama",
  "annals",
  "cell",
  "plos",
  "frontiers",
  "mdpi",
];

// ─── SPECIALTY PRIORITY ORDER ─────────────────────────────────────────────────
// Специальности в порядке приоритета — более специфичные идут первыми.
// При совпадении нескольких specialty, первая в этом списке становится primary.
const SPECIALTY_PRIORITY = [
  "oncology",
  "infectious",
  "hematology",
  "genetics",
  "psychiatry",
  "neurology",
  "ophthalmology",
  "ent",
  "dermatology",
  "rheumatology",
  "orthopedics",
  "gynecology",
  "urology",
  "gastroenterology",
  "endocrinology",
  "nephrology",
  "pediatrics",
  "radiology",
  "rehabilitation",
  "dentistry",
  "sports_medicine",
  "emergency",
  "anesthesiology",
  "allergy",
  "pulmonology",
  "cardiology",
  "surgery",
  "general",
];

// ─── SPECIALTY KEYWORD RULES ──────────────────────────────────────────────────
const SPECIALTY_RULES = {
  oncology: [
    "oncology",
    "oncologist",
    "oncologist-chemotherapist",
    "oncologist-radiotherapist",
    "cancer",
    "tumor",
    "tumour",
    "carcinoma",
    "metastatic",
    "chemotherapy",
    "immunotherapy",
    "radiotherapy",
    "targeted therapy",
    "melanoma",
    "leukemia",
    "lymphoma",
    "adenocarcinoma",
    "gastric cancer",
    "breast cancer",
    "lung cancer",
    "prostate cancer",
    "colorectal cancer",
    "pancreatic cancer",
    "glioblastoma",
    "sarcoma",
    "myeloma",
    "biopsy",
    "remission",
    "oncogene",
    "biomarker tumor",
    "car-t",
  ],
  infectious: [
    "infectious disease",
    "infectious disease specialist",
    "infection",
    "infectious",
    "virus",
    "viral",
    "bacterial",
    "pandemic",
    "covid",
    "influenza",
    "tuberculosis",
    "hiv",
    "aids",
    "hepatitis",
    "antibiotic resistance",
    "sepsis",
    "malaria",
    "dengue",
    "ebola",
    "meningitis",
    "pneumococcal",
    "vaccine",
    "antimicrobial",
    "pathogen",
    "outbreak",
    "epidemic",
    "phthisis",
    "phthisiatrician",
  ],
  hematology: [
    "hematology",
    "hematologist",
    "blood",
    "anemia",
    "platelet",
    "coagulation",
    "clotting",
    "hemophilia",
    "thrombocytopenia",
    "myeloma",
    "bone marrow",
    "sickle cell",
    "thalassemia",
    "transfusion",
    "erythrocyte",
    "leukocyte",
    "hemoglobin",
    "plasma",
    "serum ferritin",
  ],
  genetics: [
    "genetics",
    "geneticist",
    "medical geneticist",
    "molecular diagnostics",
    "genomics",
    "genome",
    "gene therapy",
    "crispr",
    "mutation",
    "hereditary",
    "chromosomal",
    "dna",
    "rna",
    "sequencing",
    "genetic testing",
    "biomarker genetic",
    "epigenetics",
    "pharmacogenomics",
    "rare disease",
  ],
  psychiatry: [
    "psychiatry",
    "psychiatrist",
    "psychologist",
    "psychotherapist",
    "addiction specialist",
    "child psychiatrist",
    "mental health",
    "depression",
    "anxiety",
    "schizophrenia",
    "bipolar",
    "ptsd",
    "ocd",
    "adhd",
    "autism",
    "psychosis",
    "antidepressant",
    "antipsychotic",
    "cognitive behavioral",
    "therapy psychology",
    "suicidal",
    "mental disorder",
    "neurodevelopmental",
    "stress disorder",
    "insomnia psychiatric",
  ],
  neurology: [
    "neurology",
    "neurologist",
    "pediatric neurologist",
    "brain",
    "neuro",
    "alzheimer",
    "parkinson",
    "epilepsy",
    "seizure",
    "multiple sclerosis",
    "stroke",
    "migraine",
    "dementia",
    "paralysis",
    "brain chip",
    "spinal cord",
    "neuropathy",
    "motor neuron",
    "amyotrophic lateral sclerosis",
    "als",
    "huntington",
    "myasthenia gravis",
    "cerebral",
    "neurotransmitter",
    "dopamine",
    "brain stimulation",
    "deep brain stimulation",
    "cognitive",
    "memory loss",
  ],
  ophthalmology: [
    "ophthalmology",
    "ophthalmologist",
    "oculist",
    "neuro-ophthalmologist",
    "retinologist",
    "oculoplastic",
    "eye",
    "vision",
    "retina",
    "glaucoma",
    "cataract",
    "macular degeneration",
    "cornea",
    "intraocular",
    "laser eye",
    "strabismus",
    "optic nerve",
  ],
  ent: [
    "otolaryngology",
    "otolaryngologist",
    "ent",
    "audiologist",
    "phoniatrist",
    "rhinologist",
    "ear",
    "nose",
    "throat",
    "hearing loss",
    "tinnitus",
    "sinusitis",
    "tonsillitis",
    "laryngeal",
    "vocal cord",
    "cochlear implant",
    "otitis",
    "rhinitis",
    "nasal polyp",
    "snoring",
    "vertigo",
  ],
  dermatology: [
    "dermatology",
    "dermatologist",
    "skin",
    "dermatitis",
    "psoriasis",
    "acne",
    "melanoma",
    "eczema",
    "rash",
    "wound healing",
    "laser skin",
    "pigmentation",
    "sebaceous",
    "hair loss",
    "alopecia",
    "nail",
    "cutaneous",
  ],
  rheumatology: [
    "rheumatology",
    "rheumatologist",
    "arthritis",
    "rheumatoid",
    "lupus",
    "autoimmune",
    "fibromyalgia",
    "gout",
    "scleroderma",
    "sjogren",
    "vasculitis",
    "joint pain",
    "inflammation",
    "ankylosing spondylitis",
    "osteoporosis",
  ],
  orthopedics: [
    "orthopedic",
    "orthopedics",
    "trauma surgeon",
    "bone",
    "fracture",
    "joint replacement",
    "arthroplasty",
    "spine surgery",
    "scoliosis",
    "ligament",
    "tendon",
    "cartilage",
    "osteoarthritis",
    "prosthetics orthopedic",
    "hip replacement",
    "knee replacement",
  ],
  gynecology: [
    "gynecology",
    "gynecologist",
    "obstetrician",
    "reproductive endocrinologist",
    "gynecologic oncologist",
    "breast specialist",
    "menopause specialist",
    "pregnancy",
    "obstetric",
    "maternal",
    "fetal",
    "menstruation",
    "ovarian",
    "uterine",
    "endometriosis",
    "polycystic ovary",
    "pcos",
    "fertility",
    "ivf",
    "breast cancer",
    "cervical",
    "vaginal",
    "menopause",
    "hormonal contraception",
    "hpv",
    "preeclampsia",
  ],
  urology: [
    "urology",
    "urologist",
    "andrologist",
    "urinary",
    "bladder",
    "prostate",
    "kidney stone",
    "urethra",
    "erectile dysfunction",
    "incontinence",
    "benign prostatic",
    "urological",
    "nephrolithiasis",
    "cystoscopy",
  ],
  gastroenterology: [
    "gastroenterology",
    "gastroenterologist",
    "hepatologist",
    "liver",
    "hepatic",
    "gastro",
    "intestinal",
    "bowel",
    "colon",
    "stomach",
    "pancreatic",
    "gut",
    "digestive",
    "crohn",
    "ulcerative colitis",
    "ibs",
    "cirrhosis",
    "fatty liver",
    "endoscopy",
    "colonoscopy",
    "gastroscopy",
    "esophagus",
    "bile duct",
    "gallbladder",
    "rectal",
    "fecal",
  ],
  endocrinology: [
    "endocrinology",
    "endocrinologist",
    "endocrine surgeon",
    "diabetes",
    "insulin",
    "thyroid",
    "endocrine",
    "obesity",
    "metabolic",
    "hormone",
    "pituitary",
    "adrenal",
    "cortisol",
    "testosterone",
    "estrogen",
    "hyperthyroidism",
    "hypothyroidism",
    "type 2 diabetes",
    "glucagon",
    "pancreas",
    "metabolism",
    "weight loss surgery",
    "bariatric",
  ],
  nephrology: [
    "nephrology",
    "nephrologist",
    "kidney",
    "renal",
    "dialysis",
    "glomerular",
    "nephritis",
    "uremia",
    "creatinine",
    "transplant kidney",
    "polycystic kidney",
    "kidney failure",
    "proteinuria",
    "hemodialysis",
  ],
  pediatrics: [
    "pediatrics",
    "pediatrician",
    "neonatologist",
    "child psychiatrist",
    "pediatric neurologist",
    "pediatric endocrinologist",
    "pediatric oncologist",
    "pediatric cardiologist",
    "children",
    "child",
    "infant",
    "newborn",
    "neonatal",
    "pediatric",
    "childhood",
    "adolescent",
    "juvenile",
    "growth hormone",
    "congenital",
  ],
  radiology: [
    "radiology",
    "radiologist",
    "medical imaging specialist",
    "functional diagnostics",
    "ultrasound diagnostician",
    "mri",
    "ct scan",
    "pet scan",
    "x-ray",
    "imaging",
    "contrast",
    "interventional radiology",
    "fluoroscopy",
    "nuclear medicine",
    "spect",
    "mammography",
    "ultrasound",
    "echocardiography imaging",
    "doppler",
  ],
  rehabilitation: [
    "rehabilitation",
    "physiotherapist",
    "exercise therapy",
    "chiropractor",
    "osteopath",
    "acupuncturist",
    "speech therapist",
    "occupational therapist",
    "rehabilitation psychologist",
    "recovery",
    "physical therapy",
    "occupational therapy",
    "speech language",
    "motor rehabilitation",
    "post-stroke rehabilitation",
    "prosthetics rehab",
  ],
  dentistry: [
    "dentistry",
    "dentist",
    "orthodontist",
    "periodontist",
    "prosthodontist",
    "endodontist",
    "dental hygienist",
    "oral pathologist",
    "oral surgeon",
    "dental",
    "tooth",
    "teeth",
    "oral health",
    "cavity",
    "implant dental",
    "braces",
    "gum disease",
    "root canal",
    "dental caries",
    "periodontal",
  ],
  sports_medicine: [
    "sports medicine",
    "sports doctor",
    "kinesiologist",
    "athletic trainer",
    "athlete",
    "sports injury",
    "muscle strain",
    "doping",
    "performance enhancement",
    "concussion",
    "physical fitness",
    "exercise physiology",
    "sports nutrition",
    "overuse injury",
  ],
  emergency: [
    "emergency medicine",
    "emergency doctor",
    "disaster medicine",
    "triage",
    "emergency",
    "trauma care",
    "resuscitation",
    "cpr",
    "acute care",
    "critical care",
    "icu",
    "intensive care",
    "shock",
    "poisoning",
    "overdose emergency",
  ],
  anesthesiology: [
    "anesthesiology",
    "anesthesiologist",
    "pain management",
    "anesthesia",
    "sedation",
    "perioperative pain",
    "epidural",
    "regional anesthesia",
    "opioid management",
    "chronic pain",
    "palliative",
    "nerve block",
  ],
  allergy: [
    "allergist",
    "immunologist",
    "allergist-immunologist",
    "allergy",
    "allergic",
    "anaphylaxis",
    "asthma allergy",
    "eczema",
    "atopic",
    "urticaria",
    "hypersensitivity",
    "immunotherapy allergy",
    "antihistamine",
    "food allergy",
  ],
  pulmonology: [
    "pulmonology",
    "pulmonologist",
    "lung",
    "pulmonary",
    "respiratory",
    "asthma",
    "copd",
    "pneumonia",
    "bronchitis",
    "emphysema",
    "fibrosis",
    "pleural",
    "spirometry",
    "inhaler",
    "bronchoscopy",
    "oxygen therapy",
    "sleep apnea",
    "ventilator",
    "trachea",
    "bronchial",
  ],
  cardiology: [
    "cardiology",
    "cardiologist",
    "interventional cardiologist",
    "heart",
    "cardiac",
    "cardiovascular",
    "myocardial",
    "arrhythmia",
    "hypertension",
    "coronary",
    "atrial fibrillation",
    "heart failure",
    "stroke prevention",
    "pacemaker",
    "echocardiography",
    "ekg",
    "ecg",
    "aorta",
    "valve",
    "ventricular",
    "stent",
    "angioplasty",
    "cardiac arrest",
    "chest pain",
    "angina",
  ],
  surgery: [
    "surgery",
    "surgical",
    "surgeon",
    "neurosurgeon",
    "orthopedic",
    "maxillofacial",
    "cardiac surgeon",
    "thoracic surgeon",
    "abdominal surgeon",
    "coloproctologist",
    "plastic surgeon",
    "vascular surgeon",
    "transplant surgeon",
    "oral surgeon",
    "robotic surgeon",
    "oculoplastic surgeon",
    "bariatric surgeon",
    "operation",
    "postoperative",
    "laparoscopic",
    "robotic surgery",
    "transplant",
    "resection",
    "anastomosis",
    "incision",
    "minimally invasive",
    "open surgery",
    "perioperative",
    "anesthesia",
    "wound",
    "suture",
    "graft",
  ],
  general: [],
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function normalizeText(...parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function classifyTypeBySource(
  sourceSlug = "",
  sourceName = "",
  title = "",
  summary = "",
) {
  const source = `${sourceSlug} ${sourceName}`.toLowerCase();
  const text = normalizeText(title, summary);
  if (RESEARCH_SOURCES.some((s) => source.includes(s))) return "research";
  const researchPhrases = [
    "phase 1",
    "phase 2",
    "phase 3",
    "phase i",
    "phase ii",
    "phase iii",
    "randomized trial",
    "randomised trial",
    "systematic review",
    "meta-analysis",
    "cohort study",
    "clinical trial",
    "double-blind",
    "placebo-controlled",
    "retrospective study",
    "prospective study",
    "case-control",
  ];
  if (researchPhrases.some((p) => text.includes(p))) return "research";
  return "news";
}

function classifySpecialties(title = "", summary = "", content = "") {
  const text = normalizeText(title, summary, content);
  const matched = new Set();

  for (const [specialty, keywords] of Object.entries(SPECIALTY_RULES)) {
    if (specialty === "general") continue;
    if (keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      matched.add(specialty);
    }
  }

  if (matched.size === 0) {
    return {
      specialty: "general",
      specialties: ["general"],
      tags: ["general"],
    };
  }

  // Выбираем primary specialty по приоритетному списку
  const primary =
    SPECIALTY_PRIORITY.find((sp) => matched.has(sp)) || [...matched][0];

  // Сортируем specialties: primary первым, остальные по приоритету
  const sorted = SPECIALTY_PRIORITY.filter((sp) => matched.has(sp));

  return {
    specialty: primary,
    specialties: sorted,
    tags: sorted,
  };
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export async function hybridClassify(article = {}) {
  const type = classifyTypeBySource(
    article.sourceSlug || "",
    article.sourceName || "",
    article.title || "",
    article.summary || "",
  );
  const specialtyResult = classifySpecialties(
    article.title || "",
    article.summary || "",
    article.content || "",
  );
  return {
    type,
    specialty: specialtyResult.specialty,
    specialties: specialtyResult.specialties,
    tags: specialtyResult.tags,
  };
}

// ─── SIMPLE KEYWORD CLASSIFIER ────────────────────────────────────────────────
export function classifyByKeywords(text) {
  const lower = text.toLowerCase();
  // Проверяем по приоритетному порядку
  for (const specialty of SPECIALTY_PRIORITY) {
    if (specialty === "general") continue;
    const keywords = SPECIALTY_RULES[specialty] || [];
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return specialty;
    }
  }
  return null;
}

// ─── LEGACY SIMPLE CLASSIFIER (kept for backward compatibility) ───────────────
export function classifyArticle(article) {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  const result = classifySpecialties(article.title, article.summary, "");
  let type = "news";
  if (
    text.includes("trial") ||
    text.includes("study") ||
    text.includes("research") ||
    text.includes("randomized") ||
    text.includes("meta-analysis")
  ) {
    type = "research";
  }
  return {
    type,
    specialty: result.specialty,
    specialties: result.specialties,
    tags: result.tags,
  };
}

// ─── ALL VALID SPECIALTY VALUES (for validation/UI) ───────────────────────────
export const ALL_SPECIALTIES = Object.keys(SPECIALTY_RULES);
