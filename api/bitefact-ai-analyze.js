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

function corsHeaders() {
  const allowedOrigin = process.env.BITEFACT_ALLOWED_ORIGIN || "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": ALLOWED_METHODS.join(", "),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function send(res, status, payload) {
  res.status(status).set(corsHeaders()).json(payload);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function extractImageData(image) {
  if (typeof image !== "string" || image.length === 0) {
    return null;
  }

  // Accept a browser FileReader data URI. Do not accept arbitrary remote URLs.
  if (!image.startsWith("data:image/")) {
    return null;
  }

  const match = image.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,[A-Za-z0-9+/=]+$/i);
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

module.exports = async function handler(req, res) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    return send(res, 405, { error: "Method not allowed." });
  }

  if (req.method === "OPTIONS") {
    return res.status(204).set(corsHeaders()).end();
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return send(res, 500, {
      error: "Perplexity API is not configured on the server."
    });
  }

  const body = req.body || {};

  if (body.image && !extractImageData(body.image)) {
    return send(res, 400, {
      error: "Invalid image. BiteFact expects a JPEG, PNG, WEBP, or GIF data URI."
    });
  }

  if (!body.image && !body.food) {
    return send(res, 400, { error: "Food or image is required." });
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

  try {
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
      return send(res, 502, {
        error: "BiteFact AI could not analyze the meal right now.",
        providerStatus: response.status
      });
    }

    const content = raw?.choices?.[0]?.message?.content;
    if (!content) {
      return send(res, 502, {
        error: "BiteFact AI returned an empty result."
      });
    }

    let result;
    try {
      result = typeof content === "string" ? JSON.parse(content) : content;
    } catch (error) {
      console.error("Invalid structured response from Perplexity:", content);
      return send(res, 502, {
        error: "BiteFact AI returned an unreadable nutrition result."
      });
    }

    const normalized = {
      food: String(result.food || "Food detected").slice(0, 120),
      portion: String(result.portion || "1 serving").slice(0, 120),
      calories: Math.round(clampNumber(result.calories, 0, 10000)),
      protein: Math.round(clampNumber(result.protein, 0, 1000) * 10) / 10,
      carbs: Math.round(clampNumber(result.carbs, 0, 1000) * 10) / 10,
      fat: Math.round(clampNumber(result.fat, 0, 1000) * 10) / 10,
      confidence: Math.round(clampNumber(result.confidence, 0, 1) * 100) / 100,
      notes: String(result.notes || "Nutrition values are estimates.").slice(0, 500)
    };

    return send(res, 200, normalized);
  } catch (error) {
    console.error("BiteFact Perplexity proxy error:", error);

    return send(res, 500, {
      error: "BiteFact AI is temporarily unavailable."
    });
  }
};
