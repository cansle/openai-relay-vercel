import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { word } = req.body;

    if (!word) {
      return res.status(400).json({ error: "word is required" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing" });
    }

    const prompt = `
Create one child-friendly illustration that clearly shows the meaning of the word "${word}".

Rules:
- no English text
- no Korean text
- no letters or labels
- cute elementary picture-dictionary style
- soft bright colors
- clear main subject
- easy for children to understand at a glance
- square composition
- avoid clutter
`;

    const result = await client.images.generate({
      model: "gpt-image-1-mini",
      prompt,
      size: "1024x1024"
    });

    if (!result?.data?.[0]?.b64_json) {
      return res.status(500).json({
        error: "No image data returned from OpenAI",
        raw: result
      });
    }

    return res.status(200).json({
      image: result.data[0].b64_json
    });

  } catch (error) {
    console.error("IMAGE API ERROR:", error);

    return res.status(500).json({
      error: error?.message || "Unknown server error",
      details: error?.response?.data || null
    });
  }
}
