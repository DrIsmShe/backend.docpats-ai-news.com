import Synthesis from "./synthesis.model.js";

// GET /api/synthesis — список (без body, только карточки)
export async function getList(req, res) {
  try {
    const { specialty, page = 1, limit = 10 } = req.query;
    const filter = { status: "published" };
    if (specialty) filter.specialty = specialty;

    const [articles, total] = await Promise.all([
      Synthesis.find(filter)
        .sort({ createdAt: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .select("-body")
        .lean(),
      Synthesis.countDocuments(filter),
    ]);

    res.json({ success: true, articles, total, page: +page });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/synthesis/:id — полная статья
export async function getOne(req, res) {
  try {
    const article = await Synthesis.findById(req.params.id).lean();
    if (!article)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, article });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
