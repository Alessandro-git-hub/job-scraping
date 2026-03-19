// ─────────────────────────────────────────────────────────────
// Job History — persist seen job links across runs
// ─────────────────────────────────────────────────────────────

import fs from "node:fs";
import { JOB_HISTORY_FILE } from "./config.js";

/**
 * Load the set of previously seen job links from disk.
 * @returns {Set<string>}
 */
export function loadJobHistory() {
  try {
    if (fs.existsSync(JOB_HISTORY_FILE)) {
      const data = fs.readFileSync(JOB_HISTORY_FILE, "utf-8");
      const history = JSON.parse(data);
      return new Set(history.seenLinks || []);
    }
  } catch (err) {
    console.warn(`⚠️  Failed to load job history: ${err.message}`);
  }
  return new Set();
}

/**
 * Persist the updated set of seen job links to disk.
 * @param {Set<string>} seenLinks
 */
export function saveJobHistory(seenLinks) {
  try {
    const data = {
      seenLinks: Array.from(seenLinks),
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(JOB_HISTORY_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`⚠️  Failed to save job history: ${err.message}`);
  }
}
