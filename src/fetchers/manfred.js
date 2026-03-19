// ─────────────────────────────────────────────────────────────
// Manfred Fetcher — getmanfred.com (Spain's top tech job board)
//
// Manfred publishes all public offers as structured YAML files in:
//   https://github.com/getmanfred/mac/tree/main/CV/public_offers
// We use the GitHub Contents API to list files, then fetch + parse each one.
// GitHub unauthenticated rate limit: 60 req/hr — well within daily usage.
// ─────────────────────────────────────────────────────────────

const TREE_URL =
  "https://api.github.com/repos/getmanfred/mac/git/trees/main?recursive=1";

const RAW_BASE = "https://raw.githubusercontent.com/getmanfred/mac/main/";

/**
 * Extract a scalar value from a simple YAML key: "key: value" pattern.
 * Handles optional surrounding quotes.
 */
function yamlScalar(yaml, key) {
  const match = yaml.match(new RegExp(`^[ \\t]*${key}:\\s*["']?(.+?)["']?\\s*$`, "m"));
  return match ? match[1].trim() : null;
}

/**
 * Extract a multi-line block scalar (literal "|" or folded ">") from YAML.
 * Returns all lines of the block joined with newlines.
 */
function yamlBlock(yaml, key) {
  const start = yaml.search(new RegExp(`^[ \\t]*${key}:\\s*[|>]`, "m"));
  if (start === -1) return null;

  const afterHeader = yaml.indexOf("\n", start) + 1;
  if (!afterHeader) return null;

  // Determine the indentation of the block by looking at the first content line
  const rest = yaml.slice(afterHeader);
  const indentMatch = rest.match(/^([ \t]+)/);
  if (!indentMatch) return null;
  const indent = indentMatch[1].length;

  const lines = [];
  for (const line of rest.split("\n")) {
    // An empty line or a line with at least `indent` spaces belongs to the block
    if (line.trim() === "") {
      lines.push("");
    } else if (line.match(new RegExp(`^[ \\t]{${indent}}`))) {
      lines.push(line.slice(indent));
    } else {
      break; // Back-indented — block ended
    }
  }

  return lines.join("\n").trim() || null;
}

/**
 * Parse the minimal fields we need from a Manfred MAC YAML offer file.
 */
function parseOfferYaml(yaml, filePath) {
  // Job title — nested under "vacancies[0].title" but simple key extraction works
  // because "title:" appears in the vacancy section
  const title =
    yamlScalar(yaml, "title") ||
    "Developer";

  // Company name — "name:" under the "company:" block
  const company =
    yamlScalar(yaml, "name") ||
    "Unknown company";

  // Description — look for a "description:" block scalar or inline
  const description =
    yamlBlock(yaml, "description") ||
    yamlScalar(yaml, "description") ||
    "";

  // Canonical URL — each file is at a known path, build a human-readable link
  // Strip leading slash if any from filePath
  const relativePath = filePath.replace(/^\//, "");
  const link = `https://github.com/getmanfred/mac/blob/main/${relativePath}`;

  return { title, company, description, link };
}

/**
 * Fetch job offers from Manfred's public MAC repository on GitHub.
 *
 * @param {string} query  - Search query (e.g. "frontend developer")
 * @returns {Promise<object[]>}
 */
export async function fetchFromManfred(query) {
  try {
    // 1. Get the full file tree of the repo
    const treeRes = await fetch(TREE_URL, {
      headers: { "User-Agent": "job-scraper/1.0", Accept: "application/vnd.github+json" },
    });

    if (!treeRes.ok) throw new Error(`GitHub tree API: HTTP ${treeRes.status}`);
    const treeData = await treeRes.json();

    // 2. Filter to YAML offer files (typically under "CV/public_offers/")
    const offerFiles = (treeData.tree || []).filter(
      (node) =>
        node.type === "blob" &&
        /\.(yaml|yml)$/i.test(node.path) &&
        node.path.toLowerCase().includes("offer")
    );

    if (offerFiles.length === 0) {
      console.log("  ℹ️  Manfred: no offer files found in repository");
      return [];
    }

    // 3. Apply client-side query filter to file paths (fast pre-filter)
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    // 4. Fetch each matching file and parse it
    const jobs = [];
    for (const file of offerFiles) {
      const rawUrl = `${RAW_BASE}${file.path}`;
      let yaml;
      try {
        const res = await fetch(rawUrl, { headers: { "User-Agent": "job-scraper/1.0" } });
        if (!res.ok) continue;
        yaml = await res.text();
      } catch {
        continue;
      }

      const job = parseOfferYaml(yaml, file.path);

      // Client-side relevance filter: full phrase OR all terms present in title/description
      const searchText = `${job.title} ${job.description}`.toLowerCase();
      const relevant =
        searchText.includes(queryLower) || queryTerms.every((t) => searchText.includes(t));
      if (!relevant) continue;

      jobs.push({
        title:       job.title,
        company:     job.company,
        description: job.description,
        link:        job.link,
        source:      "Manfred",
        isRemote:    true,
        postedAtRaw: null,
      });
    }

    console.log(`  ✅  Manfred: ${jobs.length} job(s)`);
    return jobs;
  } catch (err) {
    console.warn(`  ⚠️  Manfred failed: ${err.message}`);
    return [];
  }
}
