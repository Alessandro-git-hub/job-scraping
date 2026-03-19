// ─────────────────────────────────────────────────────────────
// Configuration — constants and environment validation
// ─────────────────────────────────────────────────────────────

export const CV_PATH = "cv.txt";
export const OUTPUT_CSV = "matched_jobs.csv";
export const JOB_HISTORY_FILE = "job_history.json";

/** Jobs must have isMatch=true AND a score >= this value to be kept. */
export const MATCH_SCORE_THRESHOLD = parseInt(process.env.MATCH_SCORE_THRESHOLD, 10) || 6;

/**
 * Maximum years of experience a job can require to be considered a match.
 * Set MAX_YEARS_EXPERIENCE in your .env file.
 * If not set (or set to 0), the filter is disabled.
 */
export const MAX_YEARS_EXPERIENCE = parseInt(process.env.MAX_YEARS_EXPERIENCE, 10) || 0;

/** Max pages fetched per source per query. */
export const MAX_PAGES_PER_SOURCE = 3;

/** Default maximum age (in days) for a job to be included. */
export const DEFAULT_MAX_AGE_DAYS = 14;

/**
 * Ensure all critical environment variables are present.
 * Exits the process with a descriptive message if anything is missing.
 */
export function validateEnv() {
  if (!process.env.SERPAPI_API_KEY) {
    console.error(
      "❌  Missing SERPAPI_API_KEY. Add your key to .env file.\n" +
        "   Get one at https://serpapi.com/"
    );
    process.exit(1);
  }
}
