import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function classifyWithAI(text) {
  const prompt = `
Classify this medical article.

Return JSON:

{
"type": "news or research",
"specialty": "cardiology | oncology | neurology | radiology | genetics | psychiatry | infectious_disease"
}

Text:
${text}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return JSON.parse(response.choices[0].message.content);
}
