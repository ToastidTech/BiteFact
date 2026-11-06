const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
// Capture the exact transmitted bytes for the PayPal webhook route — PayPal's
// signature verification requires the verbatim request body.
app.use(express.json({
  limit: "12mb",
  verify: (req, _res, buf) => {
    if (req.path === "/api/pulsematrix-webhook") req.rawBody = buf.toString("utf8");
  }
}));

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

async function analyzeWithAnthropic(body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const error = new Error("Anthropic API is not configured on the server.");
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

  const messageContent = [];

  if (body.image) {
    const dataUri = extractImageData(body.image);
    const mediaType = dataUri
      .slice(5, dataUri.indexOf(";"))
      .toLowerCase()
      .replace("image/jpg", "image/jpeg");
    messageContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: dataUri.slice(dataUri.indexOf(",") + 1)
      }
    });
  }

  messageContent.push({
    type: "text",
    text: buildPrompt(body)
  });

  const systemPrompt = `You are BiteFact's nutrition estimation engine. Be conservative, transparent, and consistent. Nutrition values are estimates, not medical advice.

Respond with ONLY a raw JSON object matching this schema, with no markdown code fences and no commentary:
${JSON.stringify(nutritionSchema)}`;

  const anthropicRequest = {
    model: process.env.BITEFACT_MODEL || "claude-opus-4-8",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: messageContent
      }
    ]
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(anthropicRequest)
  });

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    const providerMessage = raw?.error?.message || `HTTP ${response.status}`;
    console.error("Anthropic API error:", response.status, providerMessage);
    const error = new Error("BiteFact AI could not analyze the meal right now.");
    error.status = 502;
    throw error;
  }

  const textBlock = Array.isArray(raw?.content)
    ? raw.content.find(
        (block) => block && block.type === "text" && typeof block.text === "string"
      )
    : null;

  if (!textBlock || !textBlock.text.trim()) {
    const error = new Error("BiteFact AI returned an empty result.");
    error.status = 502;
    throw error;
  }

  const cleaned = textBlock.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch (error) {
    console.error("Invalid JSON response from Anthropic:", textBlock.text.slice(0, 500));
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
    const result = await analyzeWithAnthropic(req.body || {});
    return send(res, 200, result);
  } catch (error) {
    console.error("BiteFact AI error:", error);
    return send(res, error.status || 500, {
      error: error.message || "BiteFact AI is temporarily unavailable."
    });
  }
});

/* =========================
   LEAD CAPTURE (HubSpot — mirrors Cope)
   ========================= */

const HUBSPOT_ACCESS_TOKEN = String(process.env.HUBSPOT_ACCESS_TOKEN || "").trim();
const HUBSPOT_SOURCE = String(process.env.HUBSPOT_SOURCE || "BiteFact Lead Capture").trim();
const LEADS_FILE = process.env.BITEFACT_LEADS_FILE || path.join(__dirname, "data", "bitefact-leads.jsonl");
const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
const LEAD_RATE_WINDOW_MS = 10 * 60 * 1000;
const LEAD_RATE_MAX = 20;
const leadRequestLog = new Map();

if (!HUBSPOT_ACCESS_TOKEN) {
  console.warn("HubSpot warning: HUBSPOT_ACCESS_TOKEN is empty — lead sync will be skipped (non-blocking).");
} else if (!HUBSPOT_ACCESS_TOKEN.startsWith("pat-")) {
  console.warn("HubSpot warning: token does not look like a private-app token (expected pat- prefix) — verify the SSM value.");
}

function getClientIP(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return String(forwarded || req.ip || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function checkLeadRateLimit(ip) {
  const now = Date.now();
  const entry = leadRequestLog.get(ip);
  if (!entry || now >= entry.resetAt) {
    leadRequestLog.set(ip, { count: 1, resetAt: now + LEAD_RATE_WINDOW_MS });
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > LEAD_RATE_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

function validateBiteFactLead(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  if (!name || name.length > 120) return null;
  if (!email || email.length > 254 || !/^(\S+@\S+\.\S+)$/.test(email)) return null;
  if (comment.length > 2000) return null;
  if (!/^[A-Za-z0-9._:-]{16,200}$/.test(deviceId)) return null;
  return { name, email, comment, deviceId, submittedAt: new Date().toISOString() };
}

async function saveBiteFactLead(lead) {
  await fs.promises.mkdir(path.dirname(LEADS_FILE), { recursive: true });
  await fs.promises.appendFile(LEADS_FILE, JSON.stringify(lead) + "\n", "utf8");
}

async function hubspotBiteFactRequest(method, url, properties, retriedWithoutSource) {
  const headers = {
    "Authorization": `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify({ properties })
  });
  if (response.ok) return response.json().catch(() => ({}));
  const errText = await response.text().catch(() => "");
  // If HubSpot rejects our custom bitefact_source property (it doesn't exist in
  // the portal), retry once without it instead of failing the whole sync.
  if (!retriedWithoutSource && response.status === 400 && /bitefact_source/i.test(errText) && properties.bitefact_source !== undefined) {
    console.warn("HubSpot rejected the bitefact_source property (probably missing in portal); retrying without it.");
    const { bitefact_source: _dropped, ...rest } = properties;
    return hubspotBiteFactRequest(method, url, rest, true);
  }
  throw new Error(`HubSpot ${method} ${url} failed (${response.status}): ${errText.slice(0, 300)}`);
}

async function createBiteFactNote(contactId, comment) {
  const response = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      properties: { hs_note_body: comment.slice(0, 10000) },
      associations: [{
        to: { id: String(contactId) },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }]
      }]
    })
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`HubSpot note create failed (${response.status}): ${errText.slice(0, 200)}`);
  }
}

async function syncBiteFactLeadToHubSpot(lead) {
  if (!HUBSPOT_ACCESS_TOKEN) {
    console.warn("HubSpot sync skipped: HUBSPOT_ACCESS_TOKEN is not configured.");
    return { synced: false, reason: "not_configured" };
  }

  const nameParts = lead.name.split(/\s+/).filter(Boolean);
  const firstname = nameParts.shift() || lead.name;
  const lastname = nameParts.join(" ");
  const properties = {
    email: lead.email,
    firstname,
    ...(lastname ? { lastname } : {}),
    bitefact_source: HUBSPOT_SOURCE
  };

  const searchResponse = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: lead.email }] }],
      properties: ["email", "firstname", "lastname"],
      limit: 1
    })
  });
  if (!searchResponse.ok) {
    const errText = await searchResponse.text().catch(() => "");
    throw new Error(`HubSpot contact search failed (${searchResponse.status}): ${errText.slice(0, 300)}`);
  }
  const searchData = await searchResponse.json().catch(() => ({}));

  let contactId = null;
  let action = "updated";
  if (Array.isArray(searchData.results) && searchData.results.length > 0) {
    contactId = searchData.results[0].id;
    await hubspotBiteFactRequest("PATCH", `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, properties, false);
  } else {
    const createData = await hubspotBiteFactRequest("POST", "https://api.hubapi.com/crm/v3/objects/contacts", properties, false);
    contactId = createData.id || null;
    action = "created";
  }

  // Post the visitor's comment as a HubSpot note on the contact (non-blocking).
  if (contactId && lead.comment) {
    try {
      await createBiteFactNote(contactId, lead.comment);
    } catch (noteError) {
      console.warn("HubSpot BiteFact note sync failed (non-blocking):", noteError.message);
    }
  }
  return { synced: true, action, contactId };
}

app.options("/api/bitefact-lead", (req, res) => {
  corsHeaders(res);
  return res.status(204).end();
});

app.post("/api/bitefact-lead", async (req, res) => {
  const rate = checkLeadRateLimit(getClientIP(req));
  if (!rate.allowed) {
    return send(res, 429, { error: "Too Many Requests", retryAfter: rate.retryAfter });
  }

  const lead = validateBiteFactLead(req.body || {});
  if (!lead) {
    return send(res, 400, { error: "Name, valid email, and a valid device identifier are required; comment is optional and limited to 2,000 characters." });
  }

  try {
    const existingLeads = await fs.promises.readFile(LEADS_FILE, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
    const alreadySaved = existingLeads.split("\n").filter(Boolean).some((row) => {
      try { return JSON.parse(row).deviceId === lead.deviceId; } catch (_) { return false; }
    });
    if (!alreadySaved) await saveBiteFactLead(lead);

    const expiresAt = Date.now() + TRIAL_DURATION_MS;

    // HubSpot failure never blocks the capture: trial is granted regardless.
    try {
      const hubspotResult = await syncBiteFactLeadToHubSpot(lead);
      console.log("HubSpot BiteFact lead sync:", hubspotResult);
    } catch (hubspotError) {
      console.error("HubSpot BiteFact lead sync failed; capture remains successful:", hubspotError);
    }

    return send(res, 201, {
      ok: true,
      message: "Your information was saved.",
      accessActive: true,
      expiresAt,
      durationDays: 3
    });
  } catch (error) {
    console.error("BiteFact lead capture error:", error);
    return send(res, 500, { error: "Lead submission could not be completed." });
  }
});

/* =========================
   PULSEMATRIX PAYPAL VERIFICATION
   Secrets come from environment variables ONLY — never hardcode values:
   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID,
   PULSEMATRIX_MASTERCODE, HUBSPOT_ACCESS_TOKEN.
   PAYPAL_API_BASE defaults to PayPal live; override only for sandbox tests.
   ========================= */

const PAYPAL_CLIENT_ID = String(process.env.PAYPAL_CLIENT_ID || "").trim();
const PAYPAL_CLIENT_SECRET = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
const PAYPAL_WEBHOOK_ID = String(process.env.PAYPAL_WEBHOOK_ID || "").trim();
const PULSEMATRIX_MASTERCODE = String(process.env.PULSEMATRIX_MASTERCODE || "").trim();
const PAYPAL_API_BASE = String(process.env.PAYPAL_API_BASE || "https://api-m.paypal.com").trim();

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_WEBHOOK_ID) {
  console.warn("PulseMatrix warning: PayPal webhook secrets are not all configured — /api/pulsematrix-webhook will reject with 500 until they are set.");
}
if (!PULSEMATRIX_MASTERCODE) {
  console.warn("PulseMatrix warning: PULSEMATRIX_MASTERCODE is empty — promo-code unlocks will fail closed.");
}

let paypalTokenCache = { token: null, expiresAt: 0 };

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    const error = new Error("PayPal is not configured on the server.");
    error.status = 500;
    throw error;
  }
  const now = Date.now();
  if (paypalTokenCache.token && now < paypalTokenCache.expiresAt - 60000) {
    return paypalTokenCache.token;
  }
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: "grant_type=client_credentials"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error("PayPal OAuth failed:", response.status, JSON.stringify(data).slice(0, 300));
    const error = new Error("PayPal authentication failed.");
    error.status = 502;
    throw error;
  }
  paypalTokenCache = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 32400) * 1000
  };
  return paypalTokenCache.token;
}

async function verifyPayPalWebhookSignature(req, rawBody) {
  const token = await getPayPalAccessToken();
  const payload = {
    transmission_id: req.headers["paypal-transmission-id"],
    transmission_time: req.headers["paypal-transmission-time"],
    cert_url: req.headers["paypal-cert-url"],
    auth_algo: req.headers["paypal-auth-algo"],
    transmission_sig: req.headers["paypal-transmission-sig"],
    webhook_id: PAYPAL_WEBHOOK_ID,
    webhook_event: JSON.parse(rawBody)
  };
  const response = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  return response.ok && String(data.verification_status || "").toUpperCase() === "SUCCESS";
}

async function findHubSpotContactByEmail(email) {
  const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "pulsematrix_paid"],
      limit: 1
    })
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`HubSpot contact search failed (${response.status}): ${errText.slice(0, 200)}`);
  }
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.results) && data.results.length > 0 ? data.results[0] : null;
}

function isPulsematrixPaidContact(contact) {
  return !!contact && String(contact.properties?.pulsematrix_paid || "").toLowerCase() === "true";
}

// Idempotent: re-marking an already-paid contact is a no-op; creating the
// contact when missing keeps "no receipt number needed" working.
async function markPulsematrixPaid(email) {
  let contact = await findHubSpotContactByEmail(email);
  if (contact) {
    const alreadyPaid = isPulsematrixPaidContact(contact);
    if (!alreadyPaid) {
      await hubspotBiteFactRequest(
        "PATCH",
        `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contact.id)}`,
        { pulsematrix_paid: "true" },
        false
      );
    }
    return { contactId: contact.id, alreadyPaid };
  }
  const created = await hubspotBiteFactRequest(
    "POST",
    "https://api.hubapi.com/crm/v3/objects/contacts",
    { email, pulsematrix_paid: "true" },
    false
  );
  return { contactId: created.id || null, alreadyPaid: false };
}

// Capture IDs are globally unique, so a note mentioning one proves this exact
// event was already processed — this keeps duplicate PayPal deliveries safe.
async function pulsematrixCaptureNoteExists(captureId) {
  const response = await fetch("https://api.hubapi.com/crm/v3/objects/notes/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "hs_note_body", operator: "CONTAINS_TOKEN", value: captureId }] }],
      properties: ["hs_note_body"],
      limit: 1
    })
  });
  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.results) && data.results.length > 0;
}

function isMasterCodeMatch(code) {
  if (!PULSEMATRIX_MASTERCODE) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(PULSEMATRIX_MASTERCODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.options("/api/pulsematrix-webhook", (req, res) => {
  corsHeaders(res);
  return res.status(204).end();
});

app.post("/api/pulsematrix-webhook", async (req, res) => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_WEBHOOK_ID) {
      console.error("PulseMatrix webhook misconfigured: PayPal secrets missing.");
      return send(res, 500, { error: "Payment webhook is not configured." });
    }
    const rawBody = req.rawBody;
    if (!rawBody) {
      return send(res, 400, { error: "Missing webhook payload." });
    }

    let verified = false;
    try {
      verified = await verifyPayPalWebhookSignature(req, rawBody);
    } catch (verifyError) {
      console.error("PayPal signature verification error:", verifyError.message);
    }
    if (!verified) {
      console.warn("Rejected forged or unverifiable PayPal webhook.");
      return send(res, 401, { error: "Invalid webhook signature." });
    }

    const event = JSON.parse(rawBody);
    const eventType = String(event.event_type || "");
    if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
      return send(res, 200, { ok: true, ignored: true, eventType });
    }

    const resource = event.resource || {};
    const payerEmail = String(resource?.payer?.email_address || "").trim().toLowerCase();
    const captureId = String(resource.id || "").trim();
    const orderId = String(resource?.supplementary_data?.related_ids?.order_id || "").trim();
    const amount = String(resource?.amount?.value || "").trim();
    const currency = String(resource?.amount?.currency_code || "").trim();

    if (!payerEmail || !captureId) {
      console.warn("PulseMatrix webhook: capture event missing payer email or capture id; acknowledging without action.");
      return send(res, 200, { ok: true, ignored: true, reason: "missing_payer_or_capture" });
    }

    if (amount !== "9.99" || currency !== "USD") {
      console.warn("PulseMatrix webhook: ignoring capture with unexpected amount.", { amount, currency, payerEmail, captureId });
      return send(res, 200, { ok: true, ignored: true, reason: "unexpected_amount", amount, currency });
    }

    if (!HUBSPOT_ACCESS_TOKEN) {
      console.error("PulseMatrix webhook: HUBSPOT_ACCESS_TOKEN missing; cannot mark paid.");
      return send(res, 500, { error: "CRM sync is not configured." });
    }

    const { contactId, alreadyPaid } = await markPulsematrixPaid(payerEmail);

    let noteCreated = false;
    if (contactId && !(await pulsematrixCaptureNoteExists(captureId))) {
      const noteBody = `PulseMatrix purchase confirmed — payer ${payerEmail}, amount ${amount} ${currency}, order ${orderId || "n/a"}, capture ${captureId}.`;
      await createBiteFactNote(contactId, noteBody);
      noteCreated = true;
    }

    console.log("PulseMatrix webhook processed:", { payerEmail, captureId, orderId, contactId, alreadyPaid, noteCreated });
    return send(res, 200, { ok: true, paid: true });
  } catch (error) {
    console.error("PulseMatrix webhook error:", error);
    return send(res, 500, { error: "Webhook processing failed." });
  }
});

app.options("/api/pulsematrix-verify", (req, res) => {
  corsHeaders(res);
  return res.status(204).end();
});

app.post("/api/pulsematrix-verify", async (req, res) => {
  const rate = checkLeadRateLimit(getClientIP(req));
  if (!rate.allowed) {
    return send(res, 429, { error: "Too Many Requests", retryAfter: rate.retryAfter });
  }

  const body = req.body || {};

  // Promo/master-code path: the code value never leaves the server; only the
  // boolean result is returned. The PWA posts { code } from its promo box.
  if (typeof body.code === "string" && body.code.trim()) {
    return send(res, 200, { paid: isMasterCodeMatch(body.code.trim()) });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return send(res, 200, { paid: false });
  }

  if (!HUBSPOT_ACCESS_TOKEN) {
    console.error("PulseMatrix verify: HUBSPOT_ACCESS_TOKEN missing.");
    return send(res, 500, { error: "Verification is not configured." });
  }

  try {
    const contact = await findHubSpotContactByEmail(email);
    return send(res, 200, { paid: isPulsematrixPaidContact(contact) });
  } catch (error) {
    console.error("PulseMatrix verify error:", error);
    return send(res, 500, { error: "Verification hit a snag — try again in a moment." });
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
