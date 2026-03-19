// ─────────────────────────────────────────────────────────────
// We Work Remotely Fetcher — free RSS feed, no auth needed
// Feed: https://weworkremotely.com/categories/remote-programming-jobs.rss
// ─────────────────────────────────────────────────────────────

const FEED_URL =
  "https://weworkremotely.com/categories/remote-programming-jobs.rss";

// ─── XML helpers (no external parser dependency) ─────────────

/**
 * Extract all text occurrences of an XML tag from a string.
 * Handles both regular and CDATA sections.
 *
 * @param {string} xml
 * @param {string} tag
 * @returns {string[]}
 */
function extractAll(xml, tag) {
  const results = [];
  // Matches <tag>...</tag> (non-greedy)
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let m;
  while ((m = re.exec(xml)) !== null) {
    // Unwrap CDATA if present
    let value = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    results.push(value);
  }
  return results;
}

/**
 * Decode common HTML entities.
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
 * Strip HTML tags and collapse whitespace.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Extract the raw text content between <item> blocks.
 * @param {string} xml
 * @returns {string[]}
 */
function extractItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    items.push(m[1]);
  }
  return items;
}

// ─── Main Export ─────────────────────────────────────────────

/**
 * Fetch remote programming jobs from We Work Remotely via RSS
 * and filter client-side by query terms.
 *
 * @param {string} query - Space-separated search terms
 * @returns {Promise<Array>}
 */
export async function fetchFromWWR(query) {
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)",
        "Accept":     "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const xml = await res.text();
    const rawItems = extractItems(xml);

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(" ");

    const jobs = [];

    for (const item of rawItems) {
      // Extract fields
      const [rawTitle]   = extractAll(item, "title");
      const [rawDesc]    = extractAll(item, "description");
      const [pubDate]    = extractAll(item, "pubDate");
      const [guid]       = extractAll(item, "guid");

      if (!rawTitle || !guid) continue;

      // WWR title format: "Company Name: Job Title"
      const colonIdx = rawTitle.indexOf(": ");
      const company  = colonIdx >= 0 ? rawTitle.slice(0, colonIdx).trim() : "Unknown company";
      const title    = colonIdx >= 0 ? rawTitle.slice(colonIdx + 2).trim() : rawTitle.trim();

      // Decode and clean description
      const descDecoded = decodeEntities(rawDesc || "");
      const description = stripHtml(decodeEntities(descDecoded)); // double-decode for nested HTML entities

      // Filter by query
      const searchText = [title, company, description].join(" ").toLowerCase();
      const matches =
        searchText.includes(queryLower) ||
        queryTerms.every((term) => searchText.includes(term));

      if (!matches) continue;

      jobs.push({
        title,
        company,
        description,
        link:        guid,
        source:      "WeWorkRemotely",
        postedAtRaw: pubDate || null,
        isRemote:    true, // WWR is remote-only
      });
    }

    console.log(`  ✅  WeWorkRemotely: ${jobs.length} job(s)`);
    return jobs;
  } catch (err) {
    console.warn(`  ⚠️  WeWorkRemotely failed: ${err.message}`);
    return [];
  }
}
