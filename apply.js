// ─────────────────────────────────────────────────────────────
// Application Queue Runner — interactive job-by-job apply flow
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import fs from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";

import inquirer from "inquirer";
import { parse as parseCsvSync } from "csv-parse/sync";
import { applyToJob } from "./src/applier.js";

const CSV_PATH     = process.env.OUTPUT_CSV || "matched_jobs.csv";
const PROFILE_PATH = "profile.json";

// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  🚀  Job Application Queue — Starting…");
  console.log("═══════════════════════════════════════════════\n");

  // 1. Load profile
  if (!fs.existsSync(PROFILE_PATH)) {
    console.error(`❌  profile.json not found. Please create it (see profile.json template).`);
    process.exit(1);
  }
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));

  // 2. Load matched jobs from CSV
  const jobs = parseCSV(CSV_PATH);
  if (jobs.length === 0) {
    console.log("ℹ️  No matched jobs found in matched_jobs.csv. Run the scraper first.");
    process.exit(0);
  }

  // 3. Interactive job selector
  const { selected } = await inquirer.prompt([
    {
      type:     "checkbox",
      name:     "selected",
      message:  "Select jobs to apply to (SPACE to toggle, ENTER to confirm):",
      pageSize: 20,
      choices:  jobs.map((job, i) => ({
        name:  `[${job["Match Score"]}/10] ${job["Job Title"]} — ${job["Company"]} (${job["Remote"] === "Yes" ? "Remote" : job["Source"]})`,
        value: i,
      })),
    },
  ]);

  if (selected.length === 0) {
    console.log("ℹ️  No jobs selected. Exiting.");
    process.exit(0);
  }

  console.log(`\n✅  ${selected.length} job(s) selected. Starting queue…\n`);

  // 4. Process each selected job sequentially
  let appliedCount = 0;
  let skippedCount = 0;

  for (let qi = 0; qi < selected.length; qi++) {
    const job = jobs[selected[qi]];
    console.log(`\n${"─".repeat(55)}`);
    console.log(`  [${qi + 1}/${selected.length}]  ${job["Job Title"]} @ ${job["Company"]}`);
    console.log(`  Score: ${job["Match Score"]}/10 | ${job["Remote"] === "Yes" ? "Remote" : "On-site"}`);
    console.log(`  Reason: ${job["AI Reason"]}`);
    console.log(`${"─".repeat(55)}`);

    await applyToJob(
      {
        title:       job["Job Title"],
        company:     job["Company"],
        description: job["AI Reason"], // Best available description in the CSV
        link:        job["Link"],
      },
      profile,
      async ({ coverLetter, filledCount }) => {
        console.log(`\n  ✍️   Cover letter generated (${coverLetter.split(/\s+/).length} words)`);
        console.log(`  📋  ${filledCount} form field(s) pre-filled`);
        console.log(`\n  ── Cover Letter Preview ──────────────────────────`);
        console.log(coverLetter);
        console.log(`  ──────────────────────────────────────────────────\n`);

        // Gate: prompt user before moving on
        const { action } = await inquirer.prompt([
          {
            type:    "list",
            name:    "action",
            message: "The form is open in the browser. What would you like to do?",
            choices: [
              { name: "✅  I submitted — move to next job", value: "next" },
              { name: "⏭️   Skip this job",                  value: "skip" },
              { name: "🛑  Stop the queue",                  value: "stop" },
            ],
          },
        ]);

        if (action === "next") {
          appliedCount++;
          console.log(`  ✅  Marked as applied.`);
        } else if (action === "skip") {
          skippedCount++;
          console.log(`  ⏭️   Skipped.`);
        } else {
          console.log(`\n  🛑  Queue stopped by user.`);
          console.log(`\n  Applied: ${appliedCount} | Skipped: ${skippedCount} | Remaining: ${selected.length - qi - 1}`);
          process.exit(0);
        }
      }
    );
  }

  // 5. Summary
  console.log(`\n${"═".repeat(55)}`);
  console.log(`  🎉  Queue complete!`);
  console.log(`  Applied: ${appliedCount} | Skipped: ${skippedCount} | Total: ${selected.length}`);
  console.log(`${"═".repeat(55)}\n`);
}

// ─────────────────────────────────────────────────────────────
// CSV parser
// ─────────────────────────────────────────────────────────────

function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`CSV not found: ${filePath}`);
  const content = fs.readFileSync(filePath, "utf-8");
  return parseCsvSync(content, { columns: true, skip_empty_lines: true, relax_quotes: true });
}
}

// ─────────────────────────────────────────────────────────────

main().catch(err => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
