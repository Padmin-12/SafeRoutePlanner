/**
 * SafeRoutePlanner — Node.js proxy server
 * 
 * Now a thin proxy to the Python Flask API.
 * All ML scoring and routing happens in Flask (app.py).
 * 
 * Why keep this at all?
 * - Frontend already talks to port 3001
 * - Vite proxy config points here
 * - No frontend changes needed
 */

import express from "express";
import cors from "cors";

const app       = express();
const PORT      = 3001;
const FLASK_URL = "http://localhost:5000";

app.use(cors());
app.use(express.json());

// ── Generic proxy helper ──────────────────────────────────────
async function proxyToFlask(req, res, path, method = "GET", body = null) {
  try {
    const url = `${FLASK_URL}${path}`;
    const options = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data     = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    // Flask not running
    res.status(503).json({
      error: "Python ML backend is not running. Start it with: python ml/app.py",
    });
  }
}

// ── Routes ────────────────────────────────────────────────────

// Health check — checks both Node and Flask
app.get("/", async (_req, res) => {
  try {
    const r    = await fetch(`${FLASK_URL}/api/health`);
    const data = await r.json();
    res.json({ nodeStatus: "running", flaskStatus: data.status });
  } catch {
    res.json({ nodeStatus: "running", flaskStatus: "offline — run python ml/app.py" });
  }
});

// POST /api/route — forward to Flask
// Body: { start: "VJTI Mumbai", end: "Dadar Station Mumbai" }
app.post("/api/route", (req, res) => {
  proxyToFlask(req, res, "/api/route", "POST", req.body);
});

// GET /api/geocode?q=VJTI Mumbai — forward to Flask
app.get("/api/geocode", (req, res) => {
  const q = req.query.q || "";
  proxyToFlask(req, res, `/api/geocode?q=${encodeURIComponent(q)}`);
});

// Keep /api/locations for backwards compat — returns empty since
// we no longer have fixed locations (user types anything now)
app.get("/api/locations", (_req, res) => {
  res.json({ success: true, locations: [] });
});

app.listen(PORT, () => {
  console.log(`\n🛡️  SafeRoutePlanner Node proxy`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Forwarding ML requests → ${FLASK_URL}\n`);
  console.log(`   Make sure Flask is running: python ml/app.py\n`);
});
