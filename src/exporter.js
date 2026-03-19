// ─────────────────────────────────────────────────────────────
// Exporter — write matched jobs to CSV and log a summary
// ─────────────────────────────────────────────────────────────

import { createObjectCsvWriter } from "csv-writer";
import { OUTPUT_CSV } from "./config.js";

/**
 * Write matched jobs to a CSV file and print a breakdown summary.
 *
 * @param {Array<{
 *   title: string,
 *   company: string,
 *   source: string,
 *   isRemote: boolean,
 *   postedAt: Date|null,
 *   link: string,
 *   score: number,
 *   reason: string
 * }>} matches
 */
export async function exportCSV(matches) {
  const writer = createObjectCsvWriter({
    path: OUTPUT_CSV,
    header: [
      { id: "title",      title: "Job Title"    },
      { id: "company",    title: "Company"      },
      { id: "source",     title: "Source"       },
      { id: "isRemote",   title: "Remote"       },
      { id: "postedDate", title: "Posted Date"  },
      { id: "link",       title: "Link"         },
      { id: "score",      title: "Match Score"  },
      { id: "reason",     title: "AI Reason"    },
    ],
  });

  const records = matches.map((job) => ({
    ...job,
    isRemote:   job.isRemote ? "Yes" : "No",
    postedDate: job.postedAt ? job.postedAt.toISOString().slice(0, 10) : "Unknown",
  }));

  await writer.writeRecords(records);
  console.log(`\n📁  ${matches.length} match(es) saved to ${OUTPUT_CSV}`);

  // ── Summary by source ─────────────────────────────────────
  const bySource = matches.reduce((acc, job) => {
    acc[job.source] = (acc[job.source] || 0) + 1;
    return acc;
  }, {});

  if (Object.keys(bySource).length > 0) {
    console.log("\n📊  Matches by source:");
    Object.entries(bySource).forEach(([source, count]) => {
      console.log(`   • ${source}: ${count}`);
    });
  }

  const remoteCount = matches.filter((j) => j.isRemote).length;
  if (remoteCount > 0) {
    console.log(`\n🏠  Remote jobs: ${remoteCount} of ${matches.length}`);
  }
}
