// ─────────────────────────────────────────────────────────────
// Tecnoempleo Fetcher — Spain's leading tech job board
// RSS feed: https://www.tecnoempleo.com/rss/ofertas-trabajo.php
// Supports keyword and location filtering via query params.
// ─────────────────────────────────────────────────────────────

const RSS_BASE = "https://www.tecnoempleo.com/rss/ofertas-trabajo.php";

// ─── XML helpers (no external parser dependency) ─────────────

function extractAll(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let m;
  while ((m = re.exec(xml)) !== null) {
    let value = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    results.push(value);
  }
  return results;
}

function extractItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) items.push(m[1]);
  return items;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

function extractOne(itemXml, tag) {
  const all = extractAll(itemXml, tag);
  return all.length > 0 ? decodeEntities(all[0]) : null;
}

// ─── Main Export ─────────────────────────────────────────────

/**
 * Fetch tech jobs from Tecnoempleo RSS filtered by query and optionally location.
 *
 * @param {string} query     - Search query (e.g. "frontend developer")
 * @param {string} location  - Location filter (e.g. "Madrid", "Spain")
 * @returns {Promise<Array>}
 */
export async function fetchFromTecnoempleo(query, location) {
  try {
    const params = new URLSearchParams({ q: query });

    // Tecnoempleo supports Spanish provinces/cities via "pr" param
    // We pass location as a free-text keyword filter alongside the RSS fetch
    const url = `${RSS_BASE}?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)",
        Accept:       "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const xml = await res.text();
    const rawItems = extractItems(xml);

    // Client-side location filter — keep if no location given, or if location keyword appears in item text
    const locationLower = (location || "").toLowerCase();
    const skipLocationFilter =
      !locationLower ||
      ["spain", "españa", "remote", "remoto"].some((l) => locationLower.includes(l));

    const jobs = [];
    for (const item of rawItems) {
      const title       = extractOne(item, "title")       || "Untitled";
      const link        = extractOne(item, "link")        || "N/A";
      const description = stripHtml(extractOne(item, "description") || "");
      const pubDate     = extractOne(item, "pubDate")     || null;

      // Location filter: Tecnoempleo embeds province/city in the description
      if (!skipLocationFilter) {
        const searchText = `${title} ${description}`.toLowerCase();
        if (!searchText.includes(locationLower)) continue;
      }

      // Company often appears as "Company – Job Title" in the Tecnoempleo title format
      let company = "Unknown company";
      const dashMatch = title.match(/^(.+?)\s[–-]\s/);
      if (dashMatch) company = dashMatch[1].trim();

      jobs.push({
        title:       title.replace(/^.+?\s[–-]\s/, "").trim() || title,
        company,
        description,
        link,
        source:      "Tecnoempleo",
        isRemote:    false,
        postedAtRaw: pubDate,
      });
    }

    console.log(`  ✅  Tecnoempleo: ${jobs.length} job(s)`);
    return jobs;
  } catch (err) {
    console.warn(`  ⚠️  Tecnoempleo failed: ${err.message}`);
    return [];
  }
}
