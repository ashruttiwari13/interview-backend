// server.js
// A tiny backend that stands between your Android app and the AI.
// This is what keeps your API key safe (never put it inside the app itself).

const express = require("express");
const app = express();
app.use(express.json());

// Set this as an environment variable on Render, NOT hardcoded here.
const API_KEY = process.env.ANTHROPIC_API_KEY;

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

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          { role: "user", content: `Question: "${question}"\n\nCandidate's answer: "${answer}"` },
        ],
      }),
    });

    const data = await response.json();
    const text = data.content.map((b) => b.text || "").join("\n");
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
