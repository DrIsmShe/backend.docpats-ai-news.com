import Source from "./source.model.js";
import defaultSources from "../../config/sources.js";

async function seedSourcesIfEmpty() {
  console.log("DEFAULT SOURCES:", defaultSources.length);
  let inserted = 0;
  let updated = 0;

  for (const source of defaultSources) {
    const exists = await Source.findOne({ slug: source.slug });

    if (!exists) {
      await Source.create(source);
      inserted++;
    } else {
      // Обновляем isActive и другие поля если источник уже есть
      await Source.findOneAndUpdate(
        { slug: source.slug },
        { $set: source },
        { new: true },
      );
      updated++;
    }
  }

  // Деактивируем источники которых больше нет в defaultSources
  const allSlugs = defaultSources.map((s) => s.slug);
  await Source.updateMany(
    { slug: { $nin: allSlugs } },
    { $set: { isActive: false } },
  );

  return {
    inserted,
    updated,
    message: "Sources synced",
  };
}

async function getAllSources() {
  return Source.find().sort({ createdAt: -1 });
}

async function getActiveSources() {
  return Source.find({ isActive: true }).sort({ createdAt: -1 });
}

export { seedSourcesIfEmpty, getAllSources, getActiveSources };
