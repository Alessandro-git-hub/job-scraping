// ─────────────────────────────────────────────────────────────
// Remotive Fetcher — free remote job board API, no auth needed
// Docs: https://remotive.com/api-documentation
// ─────────────────────────────────────────────────────────────

const BASE_URL = "https://remotive.com/api/remote-jobs";

/**
 * Remotive API category for software development jobs.
 * Full list: https://remotive.com/api/remote-jobs/categories
 */
const CATEGORY = "software-dev";

/**
 * Decode common HTML entities in a string.
 * @param {string} str
 * @returns {string}
 */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Strip HTML tags from a string.
 * @param {string} str
 * @returns {string}
 */
function stripHtml(str) {
  return str.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Fetch remote software-dev jobs from Remotive and filter client-side by query.
 * Remotive returns all jobs at once for a category; we filter by query terms.
 *
 * @param {string} query - Space-separated search terms
 * @returns {Promise<Array>}
 */
export async function fetchFromRemotive(query) {
  try {
    const res = await fetch(`${BASE_URL}?category=${CATEGORY}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const data = await res.json();
    const results = data.jobs ?? [];

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(" ");

    const filtered = results.filter((job) => {
      const searchText = [
        job.title || "",
        job.company_name || "",
        job.description || "",
        (job.tags || []).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      // Prefer full-phrase match; fall back to requiring ALL individual terms
      return (
        searchText.includes(queryLower) ||
        queryTerms.every((term) => searchText.includes(term))
      );
    });

    const jobs = filtered.map((job) => ({
      title:       job.title        || "Untitled",
      company:     job.company_name || "Unknown company",
      description: stripHtml(decodeEntities(job.description || "")),
      link:        job.url          || "N/A",
      source:      "Remotive",
      postedAtRaw: job.publication_date || null,
      isRemote:    true, // Remotive is remote-only
    }));

    console.log(`  ✅  Remotive: ${jobs.length} job(s)`);
    return jobs;
  } catch (err) {
    console.warn(`  ⚠️  Remotive failed: ${err.message}`);
    return [];
  }
}
