import {
  seedSourcesIfEmpty,
  getAllSources,
  getActiveSources,
} from "./source.service.js";

async function seedSources(req, res) {
  try {
    const result = await seedSourcesIfEmpty();

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to seed sources",
      error: error.message,
    });
  }
}

async function listSources(req, res) {
  try {
    const sources = await getAllSources();

    return res.status(200).json({
      success: true,
      count: sources.length,
      data: sources,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sources",
      error: error.message,
    });
  }
}

export { seedSources, listSources };
