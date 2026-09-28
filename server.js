// server.js
// Backend that talks to Google Gemini (free tier) so the AI key stays hidden
// from the Android app. If one model is busy or unavailable, it automatically
// falls back to the next model in the list.

const express = require("express");
const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Tried in this order. If a model is busy (503/429) or not found (404),
// we move on to the next one.
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function urlFor(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

async function callGemini(body) {
  let lastData = null;

  for (const model of MODELS) {
    // 2 attempts per model (only retried when the model says "busy")
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(urlFor(model), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
          console.log(`Success with model: ${model}`);
          return data;
        }

        lastData = data;
        const code = data.error && data.error.code;
        console.error(`[${model}] attempt ${attempt} failed:`, JSON.stringify(data));

        if ((code === 503 || code === 429) && attempt < 2) {
          await sleep(2000);
          continue; // retry same model once
        }
        break; // go to next model
      } catch (err) {
        console.error(`[${model}] network error:`, err.message);
        break;
      }
    }
  }
  return lastData;
}

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
    const data = await callGemini({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
    });

    if (!data || !data.candidates || data.candidates.length === 0) {
      console.error("All models failed. Last response:", JSON.stringify(data));
      return res.status(503).json({ error: "AI service busy, please try again" });
    }

    const text = data.candidates[0].content.parts[0].text;
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    res.json(parsed);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Failed to get feedback" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
