// ─────────────────────────────────────────────────────────────
// RemoteOK Fetcher
// ─────────────────────────────────────────────────────────────

/**
 * Fetch remote jobs from the RemoteOK public API and filter by query terms.
 * RemoteOK returns all jobs at once; we filter client-side.
 *
 * @param {string} query  - Space-separated search terms
 * @returns {Promise<Array>}
 */
export async function fetchFromRemoteOK(query) {
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const data = await res.json();
    // First item is API metadata — skip it
    const results = data.slice(1);

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(" ");

    const filtered = results.filter((job) => {
      const searchText = [
        job.position || "",
        job.company || "",
        job.description || "",
        job.tags?.join(" ") || "",
      ]
        .join(" ")
        .toLowerCase();

      // Prefer full-phrase match; fall back to requiring ALL individual terms
      return searchText.includes(queryLower) ||
        queryTerms.every((term) => searchText.includes(term));
    });

    const jobs = filtered.map((job) => ({
      title:       job.position || "Untitled",
      company:     job.company || "Unknown company",
      description: job.description || "",
      link:        job.url ? `https://remoteok.com${job.url}` : "N/A",
      source:      "RemoteOK",
      postedAtRaw: job.date || null,
    }));

    console.log(`  ✅  RemoteOK: ${jobs.length} job(s)`);
    return jobs;
  } catch (err) {
    console.warn(`  ⚠️  RemoteOK failed: ${err.message}`);
    return [];
  }
}
