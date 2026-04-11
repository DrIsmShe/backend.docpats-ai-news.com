import mongoose from "mongoose";

const sourceRefSchema = new mongoose.Schema(
  {
    title: { type: String },
    url: { type: String },
    authors: { type: String },
    year: { type: Number },
  },
  { _id: false },
);

// Кэш переводов — хранится прямо в документе, отдельная коллекция не нужна
const translationCacheSchema = new mongoose.Schema(
  {
    title: { type: String },
    body: { type: String },
    translatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const synthesisSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    specialty: { type: String, default: "Общая медицина" },
    language: { type: String, default: "ru" },
    wordCount: { type: Number },
    style: { type: String }, // analytical | clinical | popular | investigative | review
    author: { type: String, default: "Доктор Исмаил" },
    sources: [sourceRefSchema],
    status: {
      type: String,
      enum: ["published", "draft"],
      default: "published",
    },
    // Map: { "en": { title, body, translatedAt }, "az": {...}, ... }
    translations: {
      type: Map,
      of: translationCacheSchema,
      default: () => new Map(),
    },
  },
  { timestamps: true },
);

export default mongoose.model("Synthesis", synthesisSchema);
