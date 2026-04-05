const specialties = {
  cardiology: [
    "heart",
    "cardiac",
    "arrhythmia",
    "coronary",
    "myocardial",
    "cardiology",
  ],

  oncology: ["cancer", "tumor", "oncology", "metastasis", "chemotherapy"],

  neurology: ["brain", "neuro", "stroke", "parkinson", "alzheimer"],

  radiology: ["MRI", "CT", "radiology", "imaging", "scan"],
};
export function classifyByKeywords(text) {
  const lower = text.toLowerCase();

  for (const [specialty, words] of Object.entries(specialties)) {
    for (const word of words) {
      if (lower.includes(word)) {
        return specialty;
      }
    }
  }

  return null;
}
