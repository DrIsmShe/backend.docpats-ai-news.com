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
  },
  { timestamps: true },
);

export default mongoose.model("Synthesis", synthesisSchema);
