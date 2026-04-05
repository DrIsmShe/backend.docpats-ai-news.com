import mongoose from "mongoose";

const briefingSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },

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

    items: [
      {
        title: String,
        summary: String,
        specialty: String,
        clusterId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Cluster",
        },
      },
    ],

    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const Briefing = mongoose.model("Briefing", briefingSchema);

export default Briefing;
