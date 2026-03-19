// ─────────────────────────────────────────────────────────────
// Arbeitnow Fetcher — free public job board API, no auth needed
// Docs: https://www.arbeitnow.com/blog/job-board-api
// ─────────────────────────────────────────────────────────────

const BASE_URL = "https://www.arbeitnow.com/api/job-board-api";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch one page of jobs from Arbeitnow, with one automatic retry on 403.
 *
 * @param {string} query
 * @param {string} location
 * @param {number} [page=1]
 * @returns {Promise<{ jobs: Array, hasMore: boolean }>}
 */
async function fetchPage(query, location, page = 1, attempt = 0) {
  const params = new URLSearchParams({ search: query, page: String(page) });
  if (location) params.set("location", location);

  const res = await fetch(`${BASE_URL}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" },
  });

  if (!res.ok) {
    if (res.status === 429 || res.status === 403) {
      if (attempt < 2) {
        const delay = (attempt + 1) * 3000;
        console.log(`  ⏳  Arbeitnow rate-limited (${res.status}), retrying in ${delay / 1000}s…`);
        await sleep(delay);
        return fetchPage(query, location, page, attempt + 1);
      }
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const results = data.data ?? [];

  const jobs = results.map((job) => ({
    title:       job.title        || "Untitled",
    company:     job.company_name || "Unknown company",
    description: job.description  || "",
    link:        job.url          || "N/A",
    source:      "Arbeitnow",
    postedAtRaw: job.created_at   ? new Date(job.created_at * 1000).toISOString() : null,
  }));

  // Arbeitnow returns up to 100 per page; if `links.next` exists there's more
  const hasMore = Boolean(data.links?.next);

  return { jobs, hasMore };
}

/**
 * Fetch jobs from Arbeitnow across multiple pages.
 *
 * @param {string} query
 * @param {string} location
 * @param {number} [maxPages=3]
 * @returns {Promise<Array>}
 */
export async function fetchFromArbeitnow(query, location, maxPages = 3) {
  try {
    const allJobs = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      if (page > 1) await sleep(1200); // avoid hammering the API
      const result = await fetchPage(query, location, page);
      allJobs.push(...result.jobs);
      hasMore = result.hasMore;
      page++;
    }

    if (page > 2) {
      console.log(`     → Fetched ${page - 1} page(s)`);
    }

    console.log(`  ✅  Arbeitnow: ${allJobs.length} job(s)`);
    return allJobs;
  } catch (err) {
    console.warn(`  ⚠️  Arbeitnow failed: ${err.message}`);
    return [];
  }
}
