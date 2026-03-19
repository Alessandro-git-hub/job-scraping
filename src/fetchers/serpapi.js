// ─────────────────────────────────────────────────────────────
// SerpApi Fetcher — Google Jobs, LinkedIn, Indeed, Glassdoor
// ─────────────────────────────────────────────────────────────

/**
 * Country/language locale map for SerpApi query parameters.
 * Each entry: [locationKeyword, { gl, hl }]
 */
const LOCALE_MAP = [
  ["spain",          { gl: "es", hl: "es" }],
  ["madrid",         { gl: "es", hl: "es" }],
  ["barcelona",      { gl: "es", hl: "es" }],
  ["alicante",       { gl: "es", hl: "es" }],
  ["valencia",       { gl: "es", hl: "es" }],
  ["france",         { gl: "fr", hl: "fr" }],
  ["paris",          { gl: "fr", hl: "fr" }],
  ["germany",        { gl: "de", hl: "de" }],
  ["berlin",         { gl: "de", hl: "de" }],
  ["italy",          { gl: "it", hl: "it" }],
  ["rome",           { gl: "it", hl: "it" }],
  ["united kingdom", { gl: "uk", hl: "en" }],
  ["london",         { gl: "uk", hl: "en" }],
  ["united states",  { gl: "us", hl: "en" }],
  ["new york",       { gl: "us", hl: "en" }],
  ["san francisco",  { gl: "us", hl: "en" }],
  ["los angeles",    { gl: "us", hl: "en" }],
  ["chicago",        { gl: "us", hl: "en" }],
  ["austin",         { gl: "us", hl: "en" }],
  ["seattle",        { gl: "us", hl: "en" }],
];

/** Display names shown in logs. */
const ENGINE_NAMES = {
  google_jobs:   "Google Jobs",
  linkedin_jobs: "LinkedIn",
  indeed_jobs:   "Indeed",
  glassdoor:     "Glassdoor",
};

/**
 * Resolve SerpApi locale params ({ gl, hl }) from a location string.
 * @param {string} location
 * @returns {{ gl: string, hl: string }}
 */
function resolveLocale(location) {
  const lower = location.toLowerCase();
  for (const [key, codes] of LOCALE_MAP) {
    if (lower.includes(key)) return codes;
  }
  return { gl: "us", hl: "en" };
}

/**
 * Build the SerpApi URL for a given engine.
 * @param {string} engine
 * @param {string} encodedQuery
 * @param {string} encodedLocation
 * @param {string} apiKey
 * @param {{ gl: string, hl: string }} locale
 * @param {string|null} nextPageToken
 * @returns {string}
 */
function buildUrl(engine, encodedQuery, encodedLocation, apiKey, locale, nextPageToken) {
  const base = "https://serpapi.com/search.json";

  switch (engine) {
    case "google_jobs":
      return nextPageToken
        ? `${base}?engine=google_jobs&next_page_token=${nextPageToken}&api_key=${apiKey}`
        : `${base}?engine=google_jobs&q=${encodedQuery}&location=${encodedLocation}&hl=${locale.hl}&gl=${locale.gl}&api_key=${apiKey}`;
    case "linkedin_jobs":
      return `${base}?engine=linkedin_jobs&keywords=${encodedQuery}&location=${encodedLocation}&api_key=${apiKey}`;
    case "indeed_jobs":
      return `${base}?engine=indeed_jobs&q=${encodedQuery}&location=${encodedLocation}&api_key=${apiKey}`;
    case "glassdoor":
      return `${base}?engine=glassdoor&keyword=${encodedQuery}&location=${encodedLocation}&api_key=${apiKey}`;
    default:
      throw new Error(`Unknown SerpApi engine: ${engine}`);
  }
}

/**
 * Extract raw job results from the API response based on engine.
 * @param {string} engine
 * @param {object} data
 * @returns {Array}
 */
function extractResults(engine, data) {
  switch (engine) {
    case "google_jobs":   return data.jobs_results ?? [];
    case "linkedin_jobs": return data.jobs ?? [];
    case "indeed_jobs":   return data.jobs_results ?? [];
    case "glassdoor":     return data.jobs ?? [];
    default: return [];
  }
}

/**
 * Normalise a raw API job object to the common job shape.
 * @param {string} engine
 * @param {object} job
 * @param {string} engineName
 * @returns {object}
 */
function normaliseJob(engine, job, engineName) {
  let title, company, description, link, postedAtRaw = null;

  switch (engine) {
    case "google_jobs":
      title       = job.title;
      company     = job.company_name;
      description = job.description;
      link        = job.apply_options?.[0]?.link ?? job.share_link ?? job.related_links?.[0]?.link;
      postedAtRaw = job.detected_extensions?.posted_at ?? null;
      break;
    case "linkedin_jobs":
      title       = job.title;
      company     = job.company_name;
      description = job.description;
      link        = job.link;
      postedAtRaw = job.detected_extensions?.posted_at ?? null;
      break;
    case "indeed_jobs":
      title       = job.title;
      company     = job.company;
      description = job.description;
      link        = job.link;
      postedAtRaw = job.date_posted ?? null;
      break;
    case "glassdoor":
      title       = job.job_title;
      company     = job.employer_name;
      description = job.job_description;
      link        = job.link;
      postedAtRaw = job.date_posted ?? null;
      break;
  }

  return {
    title:       title       ?? "Untitled",
    company:     company     ?? "Unknown company",
    description: description ?? "",
    link:        link        ?? "N/A",
    source:      engineName,
    postedAtRaw,
  };
}

/**
 * Fetch one page of jobs from a SerpApi engine.
 *
 * @param {string} engine          - "google_jobs" | "linkedin_jobs" | "indeed_jobs" | "glassdoor"
 * @param {string} query
 * @param {string} location
 * @param {string} apiKey
 * @param {string|null} [nextPageToken=null]
 * @returns {Promise<{ jobs: Array, nextPageToken: string|null }>}
 */
export async function fetchFromEngine(engine, query, location, apiKey, nextPageToken = null) {
  const engineName     = ENGINE_NAMES[engine] ?? engine;
  const encodedQuery   = encodeURIComponent(query);
  const encodedLocation = encodeURIComponent(location);
  const locale         = resolveLocale(location);
  const url            = buildUrl(engine, encodedQuery, encodedLocation, apiKey, locale, nextPageToken);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const results = extractResults(engine, data);
    const jobs    = results.map((job) => normaliseJob(engine, job, engineName));

    const nextToken =
      engine === "google_jobs"
        ? (data.serpapi_pagination?.next_page_token || null)
        : null;

    if (!nextPageToken) {
      console.log(`  ✅  ${engineName}: ${jobs.length} job(s)`);
    }

    return { jobs, nextPageToken: nextToken };
  } catch (err) {
    if (!nextPageToken) {
      const noResults = err.message.toLowerCase().includes("no results") ||
                        err.message.toLowerCase().includes("hasn't returned any results");
      if (noResults) {
        console.log(`  ℹ️  ${engineName}: no results for this query.`);
      } else {
        console.warn(`  ⚠️  ${engineName} failed: ${err.message}`);
      }
    }
    return { jobs: [], nextPageToken: null };
  }
}
