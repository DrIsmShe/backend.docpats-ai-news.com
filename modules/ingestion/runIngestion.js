import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { runIngestion } from "./ingestion.service.js";
import { seedSourcesIfEmpty } from "../sources/source.service.js";

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Mongo connected");

    // Синхронизируем источники перед ingestion
    const seedResult = await seedSourcesIfEmpty();
    console.log("Sources synced:", seedResult);

    const result = await runIngestion();
    console.log("Ingestion result:");
    console.log(result);

    process.exit(0);
  } catch (error) {
    console.error("Ingestion error:", error);
    process.exit(1);
  }
}

start();
