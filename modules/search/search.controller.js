import { semanticSearch } from "./search.service.js";

async function search(req, res) {
  try {
    const query = req.query.q;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "query required",
      });
    }

    const results = await semanticSearch(query);

    res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export { search };
