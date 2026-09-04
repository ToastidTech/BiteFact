// BiteFact AI endpoint placeholder for serverless-compatible deployments.
// The primary deployment uses server.js and Express.
// This file intentionally does not contain or expose the Perplexity API key.

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST, OPTIONS");
    return res.json({ error: "Method not allowed." });
  }

  return res.status(503).json({
    error: "BiteFact AI endpoint is available through the Express server deployment."
  });
};
