// ─────────────────────────────────────────────────────────────
// Fetcher — orchestrate all sources, deduplicate, and filter
// ─────────────────────────────────────────────────────────────

import { MAX_PAGES_PER_SOURCE, DEFAULT_MAX_AGE_DAYS } from "./config.js";
import { parsePostedDate } from "./dateParser.js";
import { fetchFromAdzuna } from "./fetchers/adzuna.js";
import { fetchFromArbeitnow } from "./fetchers/arbeitnow.js";
import { fetchFromHimalayas } from "./fetchers/himalayas.js";
import { fetchFromRemoteOK } from "./fetchers/remoteok.js";
import { fetchFromEngine } from "./fetchers/serpapi.js";
import { fetchFromTecnoempleo } from "./fetchers/tecnoempleo.js";
import { fetchFromManfred } from "./fetchers/manfred.js";
import { fetchFromRemotees } from "./fetchers/remotees.js";

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Detect whether a job is remote based on keywords in its text fields.
 * @param {object} job
 * @param {string[]} remoteKeywords
 * @returns {boolean}
 */
function isRemoteJob(job, remoteKeywords) {
  const text = [job.title, job.company, job.description]
    .join(" ")
    .toLowerCase();
  return remoteKeywords.some((kw) => text.includes(kw));
}

/**
 * Remove jobs whose text matches any of the excluded keywords.
 * @param {object[]} jobs
 * @param {string[]} excludeKeywords
 * @returns {object[]}
 */
function applyExcludeFilter(jobs, excludeKeywords) {
  if (excludeKeywords.length === 0) return jobs;

  const before = jobs.length;
  const filtered = jobs.filter((job) => {
    const text = [job.title, job.company, job.description].join(" ").toLowerCase();
    return !excludeKeywords.some((kw) => text.includes(kw));
  });

  const removed = before - filtered.length;
  if (removed > 0) {
    console.log(`🔍  Filtered out ${removed} irrelevant job(s) based on exclude keywords`);
  }
  return filtered;
}

/**
 * Remove jobs older than maxAgeDays. Jobs without a parsed date are kept.
 * @param {object[]} jobs  - Must already have a `postedAt` (Date|null) field
 * @param {number} maxAgeDays
 * @returns {object[]}
 */
function applyDateFilter(jobs, maxAgeDays) {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const before   = jobs.length;

  const filtered = jobs.filter(
    (job) => !job.postedAt || Date.now() - job.postedAt.getTime() <= maxAgeMs
  );

  const removed = before - filtered.length;
  if (removed > 0) {
    console.log(`📅  Filtered out ${removed} job(s) older than ${maxAgeDays} days`);
  }

  const withDate = filtered.filter((j) => j.postedAt).length;
  if (withDate > 0) {
    console.log(`📅  ${withDate}/${filtered.length} job(s) have a posting date`);
  }

  return filtered;
}

// ─── Source Fetchers ─────────────────────────────────────────

/**
 * Fetch all pages from a SerpApi engine (google_jobs, linkedin, etc.).
 */
async function fetchPaginatedSerpApi(engine, query, location, apiKey) {
  const allJobs = [];
  let nextPageToken = null;
  let pageCount = 0;

  let result = await fetchFromEngine(engine, query, location, apiKey);
  allJobs.push(...result.jobs);
  nextPageToken = result.nextPageToken;
  pageCount++;

  while (nextPageToken && pageCount < MAX_PAGES_PER_SOURCE) {
    result = await fetchFromEngine(engine, query, location, apiKey, nextPageToken);
    allJobs.push(...result.jobs);
    nextPageToken = result.nextPageToken;
    pageCount++;
  }

  if (pageCount > 1) {
    console.log(`     → Fetched ${pageCount} page(s)`);
  }
  return allJobs;
}

/**
 * Fetch all pages from Adzuna.
 */
async function fetchPaginatedAdzuna(query, location, appId, appKey) {
  const allJobs = [];
  let pageCount = 0;
  let hasMore   = true;

  while (hasMore && pageCount < MAX_PAGES_PER_SOURCE) {
    const result = await fetchFromAdzuna(query, location, appId, appKey, pageCount + 1);
    allJobs.push(...result.jobs);
    hasMore = result.hasMore && result.jobs.length > 0;
    pageCount++;
  }

  if (pageCount > 1) {
    console.log(`     → Fetched ${pageCount} page(s)`);
  }
  return allJobs;
}

// ─── Remote Source Cache ─────────────────────────────────────
// Remote-only sources (Arbeitnow, RemoteOK, Himalayas, Remotive, WWR) are location-agnostic.
// Cache their results globally so they're fetched once per query, not once per location.
const _remoteSourceCache = new Map(); // `${source}:${query}` → jobs[]

// remote-es is fetched once per process (independent of queries/locations)
let _remoteesCache = null;

async function fetchCachedRemote(source, query, fetchFn) {
  const key = `${source}:${query}`;
  if (!_remoteSourceCache.has(key)) {
    console.log(`\n🔹 Searching: "${query}" (remote jobs) via ${source}`);
    _remoteSourceCache.set(key, await fetchFn());
  }
  return _remoteSourceCache.get(key);
}

// ─── Main Export ─────────────────────────────────────────────

/**
 * Fetch jobs from all configured sources for a given location,
 * then deduplicate, filter, enrich with remote/date info, and
 * remove already-seen jobs.
 *
 * @param {string}      location
 * @param {Set<string>} seenLinks
 * @returns {Promise<object[]>}
 */
export async function fetchJobs(location, seenLinks) {
  const queriesEnv    = process.env.JOB_QUERIES || process.env.JOB_QUERY || "frontend developer";
  const serpApiKey    = process.env.SERPAPI_API_KEY;
  const adzunaAppId   = process.env.ADZUNA_APP_ID;
  const adzunaAppKey  = process.env.ADZUNA_APP_KEY;

  const queries        = queriesEnv.split(",").map((q) => q.trim()).filter(Boolean);
  const sourcesEnv     = process.env.JOB_SOURCES || "google_jobs";
  const enabledSources = sourcesEnv.split(",").map((s) => s.trim()).filter(Boolean);

  console.log(`🔍  Fetching jobs for "${location}"…`);
  console.log(`📡  Sources: ${enabledSources.join(", ")}`);
  console.log(`🔎  Queries: ${queries.join(", ")}`);
  console.log(`📄  Fetching up to ${MAX_PAGES_PER_SOURCE} page(s) per source\n`);

  const allJobs = [];

  // Jobicy uses single-tag matching; deduplicate to avoid redundant calls
  // when two queries normalise to the same tag (e.g. "junior frontend developer" → "frontend developer")
  const seenJobicyTags = new Set();
  const LEVEL_RE = /^(junior|senior|sr\.?|mid|lead|principal|entry[- ]level|intern)\s+/i;

  // English-only boards don't understand non-English queries and will return nothing.
  // Set NON_ENGLISH_QUERY_PATTERN in .env to override (regex string, case-insensitive).
  // Default: detect any accented character — this covers Spanish and most other Latin-script languages.
  const ENGLISH_ONLY_REMOTE_SOURCES = new Set(["arbeitnow", "remoteok", "himalayas"]);
  const _nonEnglishPattern = process.env.NON_ENGLISH_QUERY_PATTERN;
  const SPANISH_QUERY_RE = _nonEnglishPattern
    ? new RegExp(_nonEnglishPattern, "i")
    : /[áéíóúüñÁÉÍÓÚÜÑ]/;

  // ── SerpApi + Adzuna sources ──────────────────────────────
  for (const source of enabledSources) {
    // Remote-only sources are handled separately below (location-agnostic)
    if (["remoteok", "himalayas", "remotive", "weworkremotely", "manfred", "arbeitnow", "remotees"].includes(source)) continue;

    for (const query of queries) {
      console.log(`\n🔹 Searching: "${query}" in ${location} via ${source}`);

      if (source === "adzuna") {
        if (!adzunaAppId || !adzunaAppKey) {
          console.warn(`  ⚠️  Adzuna: Missing API credentials (ADZUNA_APP_ID or ADZUNA_APP_KEY)`);
          continue;
        }
        allJobs.push(...(await fetchPaginatedAdzuna(query, location, adzunaAppId, adzunaAppKey)));
      } else if (source === "arbeitnow") {
        allJobs.push(...(await fetchFromArbeitnow(query, location, MAX_PAGES_PER_SOURCE)));
      } else if (source === "jobicy") {
        const jobicyTag = query.trim().replace(LEVEL_RE, "").toLowerCase();
        if (seenJobicyTags.has(jobicyTag)) {
          console.log(`  ⏭️  Jobicy: skipping duplicate tag "${jobicyTag}"`);
          continue;
        }
        seenJobicyTags.add(jobicyTag);
        allJobs.push(...(await fetchFromJobicy(query, location)));
      } else if (source === "tecnoempleo") {
        allJobs.push(...(await fetchFromTecnoempleo(query, location)));
      } else {
        allJobs.push(...(await fetchPaginatedSerpApi(source, query, location, serpApiKey)));
      }
    }
  }

  // ── Location-agnostic remote sources (cached globally across locations) ──
  for (const query of queries) {
    for (const [source, fetchFn] of [
      ["arbeitnow", () => fetchFromArbeitnow(query, "", MAX_PAGES_PER_SOURCE)],
      ["remoteok",  () => fetchFromRemoteOK(query)],
      ["himalayas", () => fetchFromHimalayas(query, MAX_PAGES_PER_SOURCE)],
      ["manfred",   () => fetchFromManfred(query)],
    ]) {
      if (!enabledSources.includes(source)) continue;
      if (ENGLISH_ONLY_REMOTE_SOURCES.has(source) && SPANISH_QUERY_RE.test(query)) continue;
      allJobs.push(...(await fetchCachedRemote(source, query, fetchFn)));
    }
  }

  // ── remote-es company boards (fetched once per pipeline run) ──
  if (enabledSources.includes("remotees")) {
    if (!_remoteesCache) {
      console.log("\n🔹 Searching remote-es company boards…");
      const includeKws = (process.env.JOB_INCLUDE_KEYWORDS || "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const keywords = includeKws.length > 0 ? includeKws : queries;
      _remoteesCache = await fetchFromRemotees(keywords);
    }
    allJobs.push(..._remoteesCache);
  }

  // ── Deduplicate by link ───────────────────────────────────
  const uniqueMap = new Map();
  for (const job of allJobs) {
    if (job.link !== "N/A" && !uniqueMap.has(job.link)) {
      uniqueMap.set(job.link, job);
    }
  }
  const jobs = Array.from(uniqueMap.values());

  console.log(`\n✅  Total: ${jobs.length} unique job(s) fetched`);

  if (jobs.length === 0) {
    console.warn("⚠️  No jobs found. Try adjusting your JOB_QUERY, JOB_LOCATION, or JOB_SOURCES in .env");
    return [];
  }

  // ── Keyword exclusion filter ──────────────────────────────
  const excludeKeywords = (process.env.JOB_EXCLUDE_KEYWORDS || "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  let filtered = applyExcludeFilter(jobs, excludeKeywords);

  // ── Title include filter (must contain at least one keyword) ──
  const includeKeywords = (process.env.JOB_INCLUDE_KEYWORDS || "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  if (includeKeywords.length > 0) {
    const before = filtered.length;
    filtered = filtered.filter((job) => {
      const title = job.title.toLowerCase();
      return includeKeywords.some((kw) => title.includes(kw));
    });
    const removed = before - filtered.length;
    if (removed > 0) {
      console.log(`🏷️  Filtered out ${removed} job(s) whose title didn't match include keywords`);
    }
  }

  // ── Enrich: remote flag + parsed date ────────────────────
  const remoteKeywords = (
    process.env.JOB_REMOTE_KEYWORDS ||
    "remote,remoto,teletrabajo,trabajo remoto,100% remoto,fully remote,work from home,desde casa,wfh"
  )
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  filtered = filtered.map((job) => ({
    ...job,
    isRemote: isRemoteJob(job, remoteKeywords),
    postedAt: parsePostedDate(job.postedAtRaw),
  }));

  // ── Date filter ───────────────────────────────────────────
  const maxAgeDays = parseInt(process.env.JOB_MAX_AGE_DAYS || String(DEFAULT_MAX_AGE_DAYS), 10);
  filtered = applyDateFilter(filtered, maxAgeDays);

  const remoteCount = filtered.filter((j) => j.isRemote).length;
  if (remoteCount > 0) {
    console.log(`🏠  Found ${remoteCount} remote job(s) out of ${filtered.length} total`);
  }
  console.log(`📋  ${filtered.length} job(s) ready for AI evaluation`);

  // ── Skip already-seen jobs ────────────────────────────────
  const newJobs = filtered.filter((job) => !seenLinks.has(job.link));
  const skipped = filtered.length - newJobs.length;

  if (skipped > 0) {
    console.log(`⏭️  Skipped ${skipped} previously seen job(s)`);
  }
  if (newJobs.length === 0) {
    console.log(`ℹ️  All jobs have been seen before. No new jobs to evaluate.`);
  }

  return newJobs;
}
