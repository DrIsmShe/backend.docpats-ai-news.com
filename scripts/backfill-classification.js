import mongoose from "mongoose";
import dotenv from "dotenv";
import News from "../modules/news/news.model.js";
import { hybridClassify } from "../modules/ai/hybridClassifier.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Mongo connected");

  const items = await News.find({});
  console.log(`Found ${items.length} articles`);

  for (const item of items) {
    const classification = await hybridClassify({
      sourceName: item.sourceName,
      sourceSlug: item.sourceSlug,
      title: item.title,
      summary: item.summary,
      content: item.content,
    });

    item.type = classification.type;
    item.specialty = classification.specialty;
    item.specialties = classification.specialties;
    item.tags = classification.tags;

    await item.save();
    console.log(`Updated: ${item.title}`);
  }

  console.log("Backfill completed");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
