// ─────────────────────────────────────────────────────────────
// Adzuna Fetcher
// ─────────────────────────────────────────────────────────────

/** Country code map for Adzuna's per-country endpoints. */
const COUNTRY_MAP = {
  spain:          "es",
  madrid:         "es",
  barcelona:      "es",
  alicante:       "es",
  valencia:       "es",
  sevilla:        "es",
  bilbao:         "es",
  "united states": "us",
  uk:             "gb",
  "united kingdom": "gb",
  london:         "gb",
  france:         "fr",
  paris:          "fr",
  germany:        "de",
  berlin:         "de",
};

/**
 * Resolve the Adzuna country code from a free-text location string.
 * @param {string} location
 * @returns {string} ISO country code (default "us")
 */
function resolveCountry(location) {
  const lower = location.toLowerCase();
  for (const [key, code] of Object.entries(COUNTRY_MAP)) {
    if (lower.includes(key)) return code;
  }
  return "us";
}

/**
 * Fetch one page of jobs from the Adzuna API.
 *
 * @param {string} query
 * @param {string} location
 * @param {string} appId
 * @param {string} appKey
 * @param {number} [page=1]
 * @returns {Promise<{ jobs: Array, hasMore: boolean }>}
 */
export async function fetchFromAdzuna(query, location, appId, appKey, page = 1) {
  try {
    const country = resolveCountry(location);
    const encodedQuery = encodeURIComponent(query);
    const encodedLocation = encodeURIComponent(location);
    const url =
      `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}` +
      `?app_id=${appId}&app_key=${appKey}` +
      `&what=${encodedQuery}&where=${encodedLocation}&results_per_page=50`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const data = await res.json();
    const results = data.results || [];

    const jobs = results.map((job) => ({
      title:       job.title || "Untitled",
      company:     job.company?.display_name || "Unknown company",
      description: job.description || "",
      link:        job.redirect_url || "N/A",
      source:      "Adzuna",
      postedAtRaw: job.created || null,
    }));

    if (page === 1) {
      console.log(`  ✅  Adzuna: ${jobs.length} job(s)`);
    }

    return { jobs, hasMore: results.length === 50 };
  } catch (err) {
    if (page === 1) {
      console.warn(`  ⚠️  Adzuna failed: ${err.message}`);
    }
    return { jobs: [], hasMore: false };
  }
}
