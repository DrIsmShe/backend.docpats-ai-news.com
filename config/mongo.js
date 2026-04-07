import mongoose from "mongoose";

async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: true,
    });

    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
}

export default connectMongo;
