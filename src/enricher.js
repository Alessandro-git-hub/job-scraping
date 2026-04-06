// ─────────────────────────────────────────────────────────────
// Description Enricher — fetches full job descriptions from
// the actual job posting pages using a headless browser.
// Only runs on jobs whose description is shorter than MIN_LENGTH.
// ─────────────────────────────────────────────────────────────

import { chromium } from "playwright";

/** Jobs shorter than this are eligible for enrichment. */
const MIN_LENGTH = 1000;

/** Cap enriched descriptions at this length to keep CSV sane. */
const MAX_LENGTH = 6000;

/** Page load timeout per job. */
const TIMEOUT = 15_000;

/** Max parallel browser tabs open at once. */
const CONCURRENCY = 3;

/**
 * Ordered list of CSS selectors to try when extracting the
 * job description text from the rendered page.
 */
const SELECTORS = [
  "[data-testid='job-description']",          // Greenhouse, generic
  "[data-testid='jobDescriptionText']",        // Indeed
  ".job-description",
  ".jobDescriptionText",                        // Indeed alternate
  ".description__text",                         // LinkedIn
  "#job-description",
  "[class*='jobDescription']",
  "[class*='job-description']",
  "[class*='JobDescription']",
  "article.job-listing",
  ".job-details__description",
  ".job-details",
  "[data-automation='jobDescription']",        // Seek
  ".content-body",
  "main article",
];

// ─────────────────────────────────────────────────────────────

/**
 * Enrich the `description` field of each matched job that has a
 * short description by fetching the real job posting page.
 * Mutates the job objects in-place.
 *
 * @param {Array<{ title: string, company: string, link: string, description: string, source: string }>} matches
 * @returns {Promise<void>}
 */
export async function enrichDescriptions(matches) {
  const toEnrich = matches.filter(j => (j.description || "").length < MIN_LENGTH);
  if (toEnrich.length === 0) {
    console.log(`\n🔍  All descriptions already look complete — skipping enrichment.`);
    return;
  }

  console.log(`\n🔍  Enriching descriptions for ${toEnrich.length}/${matches.length} job(s)…`);

  const browser = await chromium.launch({ headless: true });

  try {
    // Process in batches of CONCURRENCY
    for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
      const batch = toEnrich.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(job => enrichOne(browser, job)));
    }
  } finally {
    await browser.close();
  }

  const enriched = matches.filter(j => (j.description || "").length >= MIN_LENGTH).length;
  console.log(`  ✅  Enrichment complete — ${enriched}/${matches.length} job(s) have full descriptions.`);
}

// ─────────────────────────────────────────────────────────────

async function enrichOne(browser, job) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    // Don't load images/fonts — faster page loads
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9,es;q=0.8" },
  });

  await context.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}", r => r.abort());

  const page = await context.newPage();

  try {
    await page.goto(job.link, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

    // Small wait for JS-rendered content
    await page.waitForTimeout(1200);

    let text = "";

    // Try specific job-description selectors first
    for (const sel of SELECTORS) {
      try {
        const el = await page.$(sel);
        if (el) {
          text = (await el.innerText()).trim();
          if (text.length > 200) break;
        }
      } catch {}
    }

    // Fall back to <main>
    if (text.length < 200) {
      try {
        text = (await page.$eval("main", el => el.innerText)).trim();
      } catch {}
    }

    // Last resort: body, but capped
    if (text.length < 200) {
      try {
        text = (await page.$eval("body", el => el.innerText)).trim();
      } catch {}
    }

    // Normalise whitespace and apply cap
    const cleaned = text
      .replace(/\t/g, " ")
      .replace(/[ ]{3,}/g, "  ")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, MAX_LENGTH);

    const previous = (job.description || "").length;
    if (cleaned.length > previous + 100) {
      job.description = cleaned;
      console.log(
        `  📄  "${job.title}" @ ${job.company} — ${previous} → ${cleaned.length} chars`
      );
    } else {
      console.log(
        `  ⚠️   "${job.title}" @ ${job.company} — page didn't yield more content (kept original)`
      );
    }
  } catch (err) {
    console.warn(
      `  ⚠️   Could not enrich "${job.title}" @ ${job.company}: ${err.message.slice(0, 80)}`
    );
  } finally {
    await context.close();
  }
}
