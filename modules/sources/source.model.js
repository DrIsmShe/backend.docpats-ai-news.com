import mongoose from "mongoose";

const sourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      enum: ["api", "rss", "html"],
      required: true,
    },
    baseUrl: {
      type: String,
      required: true,
      trim: true,
    },
    region: {
      type: String,
      default: "global",
      trim: true,
    },
    category: {
      type: String,
      default: "general",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    fetchIntervalMinutes: {
      type: Number,
      default: 30,
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    rateLimit: {
      requestsPerMinute: {
        type: Number,
        default: 20,
      },
    },
    lastFetchedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const Source = mongoose.model("Source", sourceSchema);

export default Source;
