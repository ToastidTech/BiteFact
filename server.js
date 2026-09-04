const express = require("express");

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const ALLOWED_METHODS = ["POST", "OPTIONS"];

const nutritionSchema = {
  type: "object",
  properties: {
    food: { type: "string" },
    portion: { type: "string" },
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
    confidence: { type: "number" },
    notes: { type: "string" }
  },
  required: [
    "food",
    "portion",
    "calories",
    "protein",
    "carbs",
    "fat",
    "confidence",
    "notes"
  ],
  additionalProperties: false
};

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "12mb" }));

function corsHeaders(res) {
  const allowedOrigin = process.env.BITEFACT_ALLOWED_ORIGIN || "*";
  res.set({
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": ALLOWED_METHODS.join(", "),
    "Cache-Control": "no-store"
  });
}

function send(res, status, payload) {
  corsHeaders(res);
  return res.status(status).json(payload);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function extractImageData(image) {
  if (typeof image !== "string" || image.length === 0) return null;

  if (!image.startsWith("data:image/")) return null;

  const match = image.match(
    /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,[A-Za-z0-9+/=]+$/i
  );

  return match ? image : null;
}

function buildPrompt(body) {
  if (body.image) {
    return `Analyze this food photo for BiteFact, a nutrition tracking app.

Identify the visible food or meal and estimate the edible portion shown. Estimate calories and macronutrients for the visible portion only.

Rules:
- Return ONLY the structured JSON requested by the schema.
- Do not claim medical certainty.
- Use practical nutrition estimates based on the visible portion.
- If multiple foods are visible, estimate the complete meal and use a concise combined food name.
- If the image does not contain recognizable food, set food to "Unrecognized food", portion to "Unknown", and all nutrition values to 0.
- confidence must be a number from 0 to 1.
- notes should briefly mention important uncertainty, such as portion size, hidden ingredients, sauces, or cooking method.`;
  }

  return `Analyze this manually entered meal for BiteFact.

Food: ${String(body.food || "Unknown food")}
Calories entered: ${Number(body.calories) || 0}
Protein entered: ${Number(body.protein) || 0} g
Carbs entered: ${Number(body.carbs) || 0} g
Fat entered: ${Number(body.fat) || 0} g

Return ONLY the structured JSON requested by the schema. Preserve the user's entered nutrition values when they are provided, and provide a concise coach note in notes.`;
}

async function analyzeWithPerplexity(body) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    const error = new Error("Perplexity API is not configured on the server.");
    error.status = 500;
    throw error;
  }

  if (body.image && !extractImageData(body.image)) {
    const error = new Error("Invalid image. BiteFact expects a JPEG, PNG, WEBP, or GIF data URI.");
    error.status = 400;
    throw error;
  }

  if (!body.image && !body.food) {
    const error = new Error("Food or image is required.");
    error.status = 400;
    throw error;
  }

  const messageContent = [
    {
      type: "text",
      text: buildPrompt(body)
    }
  ];

  if (body.image) {
    messageContent.push({
      type: "image_url",
      image_url: { url: body.image }
    });
  }

  const perplexityRequest = {
    model: "sonar-pro",
    stream: false,
    disable_search: true,
    temperature: 0.1,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content:
          "You are BiteFact's nutrition estimation engine. Be conservative, transparent, and consistent. Nutrition values are estimates, not medical advice."
      },
      {
        role: "user",
        content: messageContent
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "bitefact_nutrition",
        schema: nutritionSchema
      }
    }
  };

  const response = await fetch("https://api.perplexity.ai/v1/sonar", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(perplexityRequest)
  });

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Perplexity API error:", response.status, raw);
    const error = new Error("BiteFact AI could not analyze the meal right now.");
    error.status = 502;
    throw error;
  }

  const content = raw?.choices?.[0]?.message?.content;
  if (!content) {
    const error = new Error("BiteFact AI returned an empty result.");
    error.status = 502;
    throw error;
  }

  let result;
  try {
    result = typeof content === "string" ? JSON.parse(content) : content;
  } catch (error) {
    console.error("Invalid structured response from Perplexity:", content);
    const parseError = new Error("BiteFact AI returned an unreadable nutrition result.");
    parseError.status = 502;
    throw parseError;
  }

  return {
    food: String(result.food || "Food detected").slice(0, 120),
    portion: String(result.portion || "1 serving").slice(0, 120),
    calories: Math.round(clampNumber(result.calories, 0, 10000)),
    protein: Math.round(clampNumber(result.protein, 0, 1000) * 10) / 10,
    carbs: Math.round(clampNumber(result.carbs, 0, 1000) * 10) / 10,
    fat: Math.round(clampNumber(result.fat, 0, 1000) * 10) / 10,
    confidence: Math.round(clampNumber(result.confidence, 0, 1) * 100) / 100,
    notes: String(result.notes || "Nutrition values are estimates.").slice(0, 500)
  };
}

app.options("/api/bitefact-ai-analyze", (req, res) => {
  corsHeaders(res);
  return res.status(204).end();
});

app.post("/api/bitefact-ai-analyze", async (req, res) => {
  try {
    const result = await analyzeWithPerplexity(req.body || {});
    return send(res, 200, result);
  } catch (error) {
    console.error("BiteFact AI error:", error);
    return send(res, error.status || 500, {
      error: error.message || "BiteFact AI is temporarily unavailable."
    });
  }
});

app.get("/health", (req, res) => {
  return res.status(200).json({
    service: "bitefact-ai",
    status: "ok"
  });
});

app.use(express.static(__dirname, {
  extensions: ["html"]
}));

app.use((req, res) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    return res.sendFile(__dirname + "/index.html");
  }

  return send(res, 404, { error: "Not found." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BiteFact / Toastid Cloud backend listening on port ${PORT}`);
});
