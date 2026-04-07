import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import News from "./modules/news/news.model.js";
import { translateArticle } from "./modules/translate/translation.service.js";

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Mongo connected");

  const articles = await News.find({
    $or: [
      { translationStatus: "pending" },
      { translationStatus: { $exists: false } },
      { translations: { $exists: false } },
    ],
  }).select("_id title");

  console.log(`Found ${articles.length} articles to translate`);

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    console.log(`[${i + 1}/${articles.length}] Translating: ${a.title}`);
    try {
      await translateArticle(a._id);
      console.log(`✓ Done`);
    } catch (err) {
      console.error(`✗ Failed:`, err.message);
    }
  }

  console.log("All done");
  process.exit(0);
}

run();
