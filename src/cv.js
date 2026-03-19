// ─────────────────────────────────────────────────────────────
// CV Loader — reads the candidate's CV from disk
// ─────────────────────────────────────────────────────────────

import fs from "node:fs";
import { CV_PATH } from "./config.js";

/**
 * Read the candidate's CV from a local text file.
 * @param {string} path – Path to the CV file.
 * @returns {string} The CV contents.
 */
export function loadCV(path = CV_PATH) {
  try {
    const cv = fs.readFileSync(path, "utf-8");
    console.log(`✅  CV loaded (${cv.length} chars) from ${path}`);
    return cv;
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`❌  CV file not found at "${path}". Create one and try again.`);
    } else {
      console.error(`❌  Failed to read CV: ${err.message}`);
    }
    process.exit(1);
  }
}
