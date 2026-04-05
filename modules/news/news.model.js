import mongoose from "mongoose";

const newsSchema = new mongoose.Schema(
  {
    url: String,
    source: String,

    type: {
      type: String,
      enum: ["news", "research"],
    },

    specialty: String,

    importance: Number,

    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Source",
      required: true,
    },
    sourceName: {
      type: String,
      required: true,
      trim: true,
    },
    sourceSlug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    externalId: {
      type: String,
      default: null,
      trim: true,
    },
    canonicalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    urlHash: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },
    titleNormalized: {
      type: String,
      default: "",
      trim: true,
    },
    summary: {
      type: String,
      default: "",
      trim: true,
    },
    content: {
      type: String,
      default: "",
      trim: true,
    },

    aiSummaryShort: {
      type: String,
      default: "",
      trim: true,
    },
    aiSummaryLong: {
      type: String,
      default: "",
      trim: true,
    },
    categoryPrimary: {
      type: String,
      default: "general",
      trim: true,
    },
    categorySecondary: {
      type: String,
      default: "",
      trim: true,
    },
    specialties: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },

    country: {
      type: String,
      default: "global",
      trim: true,
    },
    language: {
      type: String,
      default: "en",
      trim: true,
    },

    authors: {
      type: [String],
      default: [],
    },
    journal: {
      type: String,
      default: "",
      trim: true,
    },
    doi: {
      type: String,
      default: "",
      trim: true,
    },
    pmid: {
      type: String,
      default: "",
      trim: true,
    },

    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    fetchedAt: {
      type: Date,
      default: Date.now,
    },

    importanceScore: {
      type: Number,
      default: 50,
      index: true,
    },
    evidenceLevel: {
      type: String,
      enum: ["low", "moderate", "high", ""],
      default: "",
    },

    isDuplicate: {
      type: Boolean,
      default: false,
    },
    duplicateGroupId: {
      type: String,
      default: null,
    },

    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    clusterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cluster",
      default: null,
    },
    embedding: [Number],
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
    },
    translations: {
      type: Map,
      of: new mongoose.Schema(
        {
          title: { type: String, default: "" },
          summary: { type: String, default: "" },
          aiSummaryShort: { type: String, default: "" },
          aiSummaryLong: { type: String, default: "" },
          content: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: {},
    },
    translationStatus: {
      type: String,
      enum: ["pending", "done", "failed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

newsSchema.index({ clusterId: 1 });
newsSchema.index({ importanceScore: -1 });
newsSchema.index({ publishedAt: -1 });
newsSchema.index({ specialties: 1 });
newsSchema.index({ tags: 1 });

const News = mongoose.model("News", newsSchema);

export default News;
