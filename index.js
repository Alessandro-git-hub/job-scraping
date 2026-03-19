// ─────────────────────────────────────────────────────────────
// Job-Scraping Pipeline — entry point
// ─────────────────────────────────────────────────────────────

import "dotenv/config";

import { validateEnv, MATCH_SCORE_THRESHOLD, MAX_YEARS_EXPERIENCE } from "./src/config.js";
import { loadCV }                              from "./src/cv.js";
import { loadJobHistory, saveJobHistory }      from "./src/history.js";
import { fetchJobs }                           from "./src/fetcher.js";
import { evaluateJob }                         from "./src/evaluator.js";
import { exportCSV }                           from "./src/exporter.js";

// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  🚀  Job-Scraping Pipeline — Starting…");
  console.log("═══════════════════════════════════════════════\n");

  // Step 1 — Validate environment
  validateEnv();

  // Step 2 — Load the candidate's CV
  const cv = loadCV();

  // Step 3 — Parse locations and load job history once
  const locationsEnv = process.env.JOB_LOCATIONS || process.env.JOB_LOCATION || "United States";
  const locations = locationsEnv.split(",").map(l => l.trim()).filter(Boolean);
  const seenLinks = loadJobHistory();

  console.log(`📍  Locations: ${locations.join(", ")}\n`);

  const matches = [];

  // Step 4 — Loop over each location: fetch, evaluate, accumulate
  for (const location of locations) {
    console.log(`\n${'═'.repeat(47)}`);
    console.log(`  📍  Location: ${location}`);
    console.log(`${'═'.repeat(47)}\n`);

    const jobs = await fetchJobs(location, seenLinks);

    if (jobs.length === 0) {
      console.log(`ℹ️  No new jobs found for "${location}".`);
      continue;
    }

    // Evaluate each job sequentially (respects rate limits)
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      console.log(
        `\n🤖  Evaluating ${i + 1}/${jobs.length}: "${job.title}" at ${job.company}…`
      );

      const result = await evaluateJob(job, cv);

      const yrsLabel = result.yearsRequired !== null && result.yearsRequired !== undefined
        ? `${result.yearsRequired} yrs required`
        : "yrs required: N/A";
      console.log(
        `   Score: ${result.score}/10 | Match: ${result.isMatch} | ${yrsLabel} | ${result.reason}`
      );

      // Experience gate — skip if the job demands more years than we allow
      if (
        MAX_YEARS_EXPERIENCE > 0 &&
        result.yearsRequired !== null &&
        result.yearsRequired !== undefined &&
        result.yearsRequired > MAX_YEARS_EXPERIENCE
      ) {
        console.log(
          `   ⏭️  Skipped — requires ${result.yearsRequired} yrs experience (limit: ${MAX_YEARS_EXPERIENCE})`
        );
        continue;
      }

      // Keep the job only if the AI explicitly matched it AND the score meets the threshold
      if (result.isMatch && result.score >= MATCH_SCORE_THRESHOLD) {
        matches.push({
          title: job.title,
          company: job.company,
          source: job.source,
          isRemote: job.isRemote || false,
          postedAt: job.postedAt || null,
          link: job.link,
          score: result.score,
          reason: result.reason,
        });
      }
    }

    // Mark this location's jobs as seen and persist history before moving on
    jobs.forEach(job => seenLinks.add(job.link));
    saveJobHistory(seenLinks);
  }

  // Step 5 — Export results
  if (matches.length === 0) {
    console.log("\n😕  No matching jobs found. Try broadening your CV or search query.");
    return;
  }

  await exportCSV(matches);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  ✅  Pipeline complete!");
  console.log("═══════════════════════════════════════════════\n");
}

// ─── Entry Point ─────────────────────────────────────────────

main().catch((err) => {
  console.error("💥  Unhandled error:", err);
  process.exit(1);
});
