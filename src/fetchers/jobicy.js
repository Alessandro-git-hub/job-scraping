// ─────────────────────────────────────────────────────────────
// Jobicy Fetcher — free remote job board API, no auth needed
// Docs: https://jobi.cy/apidocs
// ─────────────────────────────────────────────────────────────

const BASE_URL = "https://jobicy.com/api/v2/remote-jobs";

/**
 * Level prefixes that Jobicy doesn't understand as tags — strip them
 * so "junior frontend developer" becomes "frontend developer".
 */
const LEVEL_PREFIXES = /^(junior|senior|sr\.?|mid|lead|principal|entry[- ]level|intern)\s+/i;

/**
 * Normalise a free-text query into a Jobicy-compatible tag string.
 * Strips seniority prefixes and lower-cases the result.
 * @param {string} query
 * @returns {string}
 */
function toJobicyTag(query) {
  return query.trim().replace(LEVEL_PREFIXES, "").toLowerCase();
}

/**
 * Map a free-text location to a Jobicy geo slug.
 * Jobicy accepts country names in English, lowercase.
 */
const GEO_MAP = {
  spain:           "spain",
  madrid:          "spain",
  barcelona:       "spain",
  alicante:        "spain",
  valencia:        "spain",
  "united states": "usa",
  usa:             "usa",
  uk:              "uk",
  "united kingdom":"uk",
  london:          "uk",
  france:          "france",
  paris:           "france",
  germany:         "germany",
  berlin:          "germany",
  remote:          null, // no geo filter for purely remote searches
};

function resolveGeo(location) {
  const lower = location.toLowerCase();
  for (const [key, geo] of Object.entries(GEO_MAP)) {
    if (lower.includes(key)) return geo;
  }
  return null; // null = no geo filter (global results)
}

/**
 * Fetch remote jobs from Jobicy, filtered by query and optionally by country.
 *
 * @param {string} query
 * @param {string} location
 * @returns {Promise<Array>}
 */
export async function fetchFromJobicy(query, location) {
  const tag = toJobicyTag(query);

  try {
    const geo = resolveGeo(location);

    const params = new URLSearchParams({ count: "50", tag });
    if (geo) params.set("geo", geo);

    const res = await fetch(`${BASE_URL}?${params}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const data = await res.json();

    if (!data.success) {
      // Jobicy returns success=false when the tag yields no results — not an error
      console.log(`  ℹ️  Jobicy: no jobs found for tag "${tag}"`);
      return [];
    }

    const results = data.jobs ?? [];

    const jobs = results.map((job) => ({
      title:       job.jobTitle     || "Untitled",
      company:     job.companyName  || "Unknown company",
      description: job.jobDescription || job.jobExcerpt || "",
      link:        job.url          || "N/A",
      source:      "Jobicy",
      postedAtRaw: job.pubDate      || null,
    }));

    if (jobs.length > 0) console.log(`  ✅  Jobicy: ${jobs.length} job(s) for tag "${tag}"`);
    return jobs;
  } catch (err) {
    console.warn(`  ⚠️  Jobicy failed: ${err.message}`);
    return [];
  }
}
