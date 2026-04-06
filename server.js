// ─────────────────────────────────────────────────────────────
// Web UI Server — serves the application queue interface
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import express          from "express";
import path             from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { exec }         from "child_process";
import { parse as parseCsvSync } from "csv-parse/sync";

import { generateCoverLetter } from "./src/coverLetter.js";
import { openAndFill }        from "./src/applier.js";
import { loadCV }             from "./src/cv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.UI_PORT || 3000;
const CSV_PATH  = process.env.OUTPUT_CSV || "matched_jobs.csv";
const PROFILE   = "profile.json";

// ── Load resources once at startup ────────────────────────────
const server = { cv: null, profile: null, browser: null };

try {
  server.cv = loadCV();
  console.log(`  CV loaded (${server.cv.length} chars)`);
} catch (e) {
  console.warn(`  Warning: CV not loaded — ${e.message}`);
}

try {
  if (!existsSync(PROFILE)) throw new Error("profile.json not found");
  server.profile = JSON.parse(readFileSync(PROFILE, "utf-8"));
  console.log(`  Profile loaded for ${server.profile.firstName} ${server.profile.lastName}`);
} catch (e) {
  console.warn(`  Warning: Profile not loaded — ${e.message}`);
}

// ── Express app ────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── GET /api/jobs ──────────────────────────────────────────────
app.get("/api/jobs", async (req, res) => {
  try {
    const threshold = parseInt(process.env.MATCH_SCORE_THRESHOLD, 10) || 6;
    const all = parseCSV(CSV_PATH);
    const jobs = all.filter(j => (+j["Match Score"] || 0) >= threshold);
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/generate ─────────────────────────────────────────
// Body: { job: { title, company, description } }
app.post("/api/generate", async (req, res) => {
  if (!server.cv) return res.status(400).json({ error: "cv.txt not loaded" });
  const { job } = req.body;
  if (!job?.title) return res.status(400).json({ error: "job.title is required" });
  try {
    const coverLetter = await generateCoverLetter(job, server.cv);
    res.json({ coverLetter });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/open-form ────────────────────────────────────────
// Body: { job: { title, company, description, link }, coverLetter }
app.post("/api/open-form", async (req, res) => {
  if (!server.profile) return res.status(400).json({ error: "profile.json not found — fill it in first" });
  const { job, coverLetter } = req.body;
  if (!job?.link) return res.status(400).json({ error: "job.link is required" });

  // Close any existing browser before opening a new one
  if (server.browser) {
    try { await server.browser.close(); } catch {}
    server.browser = null;
  }

  try {
    const { browser } = await openAndFill(job, server.profile, coverLetter ?? "");
    server.browser = browser;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/close-form ───────────────────────────────────────
app.post("/api/close-form", async (req, res) => {
  if (server.browser) {
    try { await server.browser.close(); } catch {}
    server.browser = null;
  }
  res.json({ success: true });
});

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n${"═".repeat(47)}`);
  console.log(`  🚀  Job Application UI ready`);
  console.log(`  👉  ${url}`);
  console.log(`${"═".repeat(47)}\n`);

  // Auto-open in default browser on macOS / Linux / Windows
  const cmds = { darwin: "open", linux: "xdg-open", win32: "start" };
  const cmd  = cmds[process.platform];
  if (cmd) exec(`${cmd} ${url}`);
});

// ── CSV parser (csv-parse) ─────────────────────────────────────
function parseCSV(filePath) {
  if (!existsSync(filePath)) throw new Error(`CSV not found: ${filePath}`);
  const content = readFileSync(filePath, "utf-8");
  return parseCsvSync(content, { columns: true, skip_empty_lines: true, relax_quotes: true });
}
