import mongoose from "mongoose";

const clusterSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      trim: true,
    },
    summary: {
      type: String,
      default: "",
      trim: true,
    },
    specialty: {
      type: String,
      default: "general",
      trim: true,
    },
    keywords: {
      type: [String],
      default: [],
    },
    articleIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "News",
      },
    ],
    embedding: {
      type: [Number],
      default: [],
    },
    articleCount: {
      type: Number,
      default: 0,
    },
    trendScore: {
      type: Number,
      default: 0,
    },
    lastArticleAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

clusterSchema.index({ specialty: 1 });
clusterSchema.index({ articleCount: -1 });
clusterSchema.index({ lastArticleAt: -1 });
clusterSchema.index({ trendScore: -1 });
const Cluster = mongoose.model("Cluster", clusterSchema);

export default Cluster;
