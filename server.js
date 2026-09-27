// server.js
// Backend that talks to Google Gemini (free tier) so the AI key stays hidden
// from the Android app.

const express = require("express");
const app = express();
app.use(express.json());

// Set this as an environment variable on Render, NOT hardcoded here.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

app.post("/feedback", async (req, res) => {
  const { field, question, answer } = req.body;

  if (!field || !question || !answer) {
    return res.status(400).json({ error: "Missing field, question, or answer" });
  }

  const systemPrompt = `You are a strict but fair interview coach for the field "${field}".
Evaluate the candidate's spoken answer to an interview question, including grammar quality
(since this was spoken and transcribed).
Respond ONLY with raw JSON, no markdown fences, no preamble, in this exact shape:
{
  "score": <integer 1-10>,
  "grammar_mistakes": ["short grammar issue found", "short grammar issue found"],
  "mistakes": ["short content/structure mistake", "short content/structure mistake"],
  "model_answer": "a corrected, well-structured 3-5 sentence version of what they could have said, in first person"
}
If there are no grammar mistakes, return an empty array for grammar_mistakes.`;

  const userPrompt = `Question: "${question}"\n\nCandidate's answer: "${answer}"`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
      }),
    });

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get feedback" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
