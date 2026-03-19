// ─────────────────────────────────────────────────────────────
// Himalayas Fetcher — free remote job board API, no auth needed
// Docs: https://himalayas.app/jobs/api
// ─────────────────────────────────────────────────────────────

const BASE_URL = "https://himalayas.app/jobs/api";
const PAGE_SIZE = 100;

/**
 * Fetch one page of jobs from Himalayas.
 *
 * @param {string} query
 * @param {number} [offset=0]
 * @returns {Promise<{ jobs: Array, total: number }>}
 */
async function fetchPage(query, offset = 0) {
  const params = new URLSearchParams({
    q:      query,
    limit:  String(PAGE_SIZE),
    offset: String(offset),
  });

  const res = await fetch(`${BASE_URL}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const data = await res.json();
  const results = data.jobs ?? [];

  const jobs = results.map((job) => ({
    title:       job.title         || "Untitled",
    company:     job.companyName   || "Unknown company",
    description: job.description   || job.excerpt || "",
    link:        job.applicationLink || job.guid || "N/A",
    source:      "Himalayas",
    postedAtRaw: job.pubDate
      ? new Date(job.pubDate * 1000).toISOString()
      : null,
  }));

  return { jobs, total: data.totalCount ?? 0 };
}

/**
 * Fetch jobs from Himalayas across multiple pages.
 * Himalayas is remote-only so location is not used for filtering.
 *
 * @param {string} query
 * @param {number} [maxPages=3]
 * @returns {Promise<Array>}
 */
export async function fetchFromHimalayas(query, maxPages = 3) {
  try {
    const allJobs = [];
    let offset = 0;
    let pageCount = 0;
    let total = Infinity;

    while (offset < total && pageCount < maxPages) {
      const result = await fetchPage(query, offset);
      allJobs.push(...result.jobs);
      total = result.total;
      offset += PAGE_SIZE;
      pageCount++;

      if (result.jobs.length < PAGE_SIZE) break; // last page
    }

    if (pageCount > 1) {
      console.log(`     → Fetched ${pageCount} page(s)`);
    }

    console.log(`  ✅  Himalayas: ${allJobs.length} job(s)`);
    return allJobs;
  } catch (err) {
    console.warn(`  ⚠️  Himalayas failed: ${err.message}`);
    return [];
  }
}
