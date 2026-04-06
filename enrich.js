// ─────────────────────────────────────────────────────────────
// Enrich — standalone script to fetch full descriptions for
// jobs already in matched_jobs.csv
// Usage: node enrich.js
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import fs from "fs";
import { createObjectCsvWriter } from "csv-writer";
import { parse } from "csv-parse/sync";
import { enrichDescriptions } from "./src/enricher.js";

const CSV_PATH = process.env.OUTPUT_CSV || "matched_jobs.csv";

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  🔍  Description Enricher — Starting…");
  console.log("═══════════════════════════════════════════════\n");

  const rows = parseCSV(CSV_PATH);
  if (rows.length === 0) {
    console.log("ℹ️  No jobs in matched_jobs.csv.");
    process.exit(0);
  }

  // Map CSV rows to the shape enricher expects
  const jobs = rows.map(r => ({
    title:       r["Job Title"]    || "",
    company:     r["Company"]      || "",
    source:      r["Source"]       || "",
    isRemote:    r["Remote"]       === "Yes",
    postedAt:    r["Posted Date"] && r["Posted Date"] !== "Unknown" ? new Date(r["Posted Date"]) : null,
    link:        r["Link"]         || "",
    score:       r["Match Score"]  || "",
    reason:      r["AI Reason"]    || "",
    description: r["Description"]  || "",
  }));

  await enrichDescriptions(jobs);

  // Write enriched data back to CSV
  const writer = createObjectCsvWriter({
    path: CSV_PATH,
    header: [
      { id: "title",       title: "Job Title"    },
      { id: "company",     title: "Company"      },
      { id: "source",      title: "Source"       },
      { id: "isRemote",    title: "Remote"       },
      { id: "postedDate",  title: "Posted Date"  },
      { id: "link",        title: "Link"         },
      { id: "score",       title: "Match Score"  },
      { id: "reason",      title: "AI Reason"    },
      { id: "description", title: "Description"  },
    ],
  });

  const records = jobs.map(j => ({
    ...j,
    isRemote:   j.isRemote ? "Yes" : "No",
    postedDate: j.postedAt ? j.postedAt.toISOString().slice(0, 10) : "Unknown",
  }));

  await writer.writeRecords(records);
  console.log(`\n💾  Saved enriched CSV to ${CSV_PATH}`);
  console.log("\n═══════════════════════════════════════════════");
  console.log("  ✅  Done!");
  console.log("═══════════════════════════════════════════════\n");
}

// ── CSV parser ────────────────────────────────────────────────
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`CSV not found: ${filePath}`);
  const content = fs.readFileSync(filePath, "utf-8");
  return parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true });
}

main().catch(err => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
