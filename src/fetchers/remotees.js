// ─────────────────────────────────────────────────────────────
// remote-es Fetcher — company-direct job boards
// Source: https://github.com/remote-es/remotes
//
// Supported platforms: Greenhouse, Lever, Workable, BambooHR,
//                      Ashby, Personio, Recruitee
// All other platforms (LinkedIn, custom pages, etc.) are skipped.
// ─────────────────────────────────────────────────────────────

const README_URL =
  "https://raw.githubusercontent.com/remote-es/remotes/refs/heads/master/README.md";

const SLEEP_MS = 150; // polite delay between company requests

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Returns true if the text contains at least one keyword. */
function matchesAny(text, keywords) {
  if (!keywords || keywords.length === 0) return true;
  const lower = (text || "").toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ── README Parser ────────────────────────────────────────────

/** Fetch and parse the remote-es README into [{name, url}]. */
async function fetchCompanyList() {
  const res = await fetch(README_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch remote-es README: HTTP ${res.status}`);
  const text = await res.text();

  const companies = [];
  // Match: * CompanyName (optional notes) [Open positions](URL)
  const re = /^\*\s+(.+?)\[Open\s+positions\]\(([^)\s\n]+)\)?/gim;
  let match;
  while ((match = re.exec(text)) !== null) {
    const rawName = match[1].trim();
    // Strip parenthetical notes like "(All offers are remote)"
    const name = rawName.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const url = match[2].trim();
    if (url.startsWith("http")) {
      companies.push({ name, url });
    }
  }
  return companies;
}

// ── Greenhouse ───────────────────────────────────────────────

function detectGreenhouse(url) {
  const m = url.match(/(?:boards(?:\.eu)?|job-boards)\.greenhouse\.io\/([^/?#\s]+)/i);
  return m ? m[1] : null;
}

async function fetchGreenhouse(slug, companyName, keywords) {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return (data.jobs || [])
    .filter((job) => matchesAny(job.title, keywords))
    .map((job) => ({
      title:       job.title || "Untitled",
      company:     companyName,
      description: stripHtml(job.content || "").slice(0, 3000),
      link:        job.absolute_url || "N/A",
      source:      "remote-es",
      postedAtRaw: job.updated_at || null,
    }));
}

// ── Lever ────────────────────────────────────────────────────

function detectLever(url) {
  const m = url.match(/jobs\.lever\.co\/([^/?#\s]+)/i);
  return m ? m[1] : null;
}

async function fetchLever(slug, companyName, keywords) {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${slug}?mode=json`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const postings = Array.isArray(data) ? data : [];

  return postings
    .filter((job) => matchesAny(job.text, keywords))
    .map((job) => ({
      title: job.text || "Untitled",
      company: companyName,
      description: [
        stripHtml(job.description || job.descriptionPlain || ""),
        ...(job.lists || []).map((l) => l.content || ""),
      ]
        .join("\n")
        .slice(0, 3000),
      link:        job.hostedUrl || job.applyUrl || "N/A",
      source:      "remote-es",
      postedAtRaw: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    }));
}

// ── Workable ─────────────────────────────────────────────────

function detectWorkable(url) {
  const m = url.match(/apply\.workable\.com\/([^/?#\s]+)/i);
  return m ? m[1] : null;
}

async function fetchWorkable(slug, companyName, keywords) {
  // Step 1: list all jobs (no description yet)
  const listRes = await fetch(
    `https://apply.workable.com/api/v3/accounts/${slug}/jobs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)",
      },
      body: JSON.stringify({ query: "", location: [], department: [], worktype: [], remote: [] }),
    }
  );
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
  const listData = await listRes.json();

  // Filter by title before fetching full descriptions
  const candidates = (listData.results || []).filter((j) => matchesAny(j.title, keywords));

  // Step 2: fetch full description for each matching job
  const jobs = [];
  for (const job of candidates) {
    try {
      await sleep(100);
      const detailRes = await fetch(
        `https://apply.workable.com/api/v3/accounts/${slug}/jobs/${job.shortcode}`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" } }
      );
      if (!detailRes.ok) {
        // Fall back without description
        jobs.push({
          title:       job.title || "Untitled",
          company:     companyName,
          description: "",
          link:        `https://apply.workable.com/${slug}/j/${job.shortcode}/`,
          source:      "remote-es",
          postedAtRaw: job.published || null,
        });
        continue;
      }
      const detail = await detailRes.json();
      jobs.push({
        title: detail.title || job.title || "Untitled",
        company: companyName,
        description: stripHtml(
          [detail.description || "", detail.requirements || "", detail.benefits || ""].join("\n")
        ).slice(0, 3000),
        link:        `https://apply.workable.com/${slug}/j/${job.shortcode}/`,
        source:      "remote-es",
        postedAtRaw: job.published || null,
      });
    } catch {
      // skip this individual job silently
    }
  }
  return jobs;
}

// ── BambooHR ─────────────────────────────────────────────────

function detectBambooHR(url) {
  const m = url.match(/([a-z0-9-]+)\.bamboohr\.com/i);
  return m ? m[1] : null;
}

async function fetchBambooHR(slug, companyName, keywords) {
  const res = await fetch(`https://${slug}.bamboohr.com/careers/list`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return (data.result || [])
    .filter((job) => matchesAny(job.jobTitle, keywords))
    .map((job) => ({
      title:       job.jobTitle || "Untitled",
      company:     companyName,
      description: job.jobDescription
        ? stripHtml(job.jobDescription).slice(0, 3000)
        : [job.department, job.location?.city].filter(Boolean).join(" – "),
      link:        `https://${slug}.bamboohr.com/jobs/view.php?id=${job.id}`,
      source:      "remote-es",
      postedAtRaw: null,
    }));
}

// ── Ashby ────────────────────────────────────────────────────

function detectAshby(url) {
  const m = url.match(/jobs\.ashbyhq\.com\/([^/?#\s]+)/i);
  return m ? m[1] : null;
}

async function fetchAshby(slug, companyName, keywords) {
  const res = await fetch(
    "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)",
      },
      body: JSON.stringify({
        operationName: "ApiJobBoardWithTeams",
        variables: { organizationHostedJobsPageName: slug },
        query: `
          query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
            jobBoard: publishedJobBoard(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
              jobPostings {
                id title descriptionHtml locationName applicationLink isRemote publishedDate
              }
            }
          }
        `,
      }),
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const postings = data?.data?.jobBoard?.jobPostings || [];

  return postings
    .filter((job) => matchesAny(job.title, keywords))
    .map((job) => ({
      title:       job.title || "Untitled",
      company:     companyName,
      description: stripHtml(job.descriptionHtml || "").slice(0, 3000),
      link:        job.applicationLink || `https://jobs.ashbyhq.com/${slug}/${job.id}`,
      source:      "remote-es",
      postedAtRaw: job.publishedDate || null,
    }));
}

// ── Personio ─────────────────────────────────────────────────

function detectPersonio(url) {
  const m = url.match(/([a-z0-9-]+)\.jobs\.personio\.(com|de|es)/i);
  return m ? { slug: m[1], tld: m[2] } : null;
}

async function fetchPersonio({ slug, tld }, companyName, keywords) {
  const res = await fetch(
    `https://${slug}.jobs.personio.${tld}/api/jobs?language=en`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();

  // Personio returns either [{total, data:[...]}] (newer) or {data:[...]} (older)
  let items = [];
  if (Array.isArray(raw)) {
    items = raw[0]?.attributes?.data ?? raw[0]?.data ?? [];
  } else {
    items = raw.data ?? [];
  }

  return items
    .filter((item) => {
      const title = item.attributes?.name ?? item.name ?? "";
      return matchesAny(title, keywords);
    })
    .map((item) => {
      const id    = item.id ?? item.attributes?.id;
      const title = item.attributes?.name ?? item.name ?? "Untitled";
      return {
        title,
        company:     companyName,
        description: "",
        link:        `https://${slug}.jobs.personio.${tld}/job/${id}`,
        source:      "remote-es",
        postedAtRaw: null,
      };
    });
}

// ── Recruitee ────────────────────────────────────────────────

function detectRecruitee(url) {
  const m = url.match(/([a-z0-9-]+)\.recruitee\.com/i);
  return m ? m[1] : null;
}

async function fetchRecruitee(slug, companyName, keywords) {
  const res = await fetch(`https://${slug}.recruitee.com/api/offers`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return (data.offers || [])
    .filter((job) => matchesAny(job.title, keywords))
    .map((job) => ({
      title:       job.title || "Untitled",
      company:     companyName,
      description: stripHtml(job.description || "").slice(0, 3000),
      link:        job.careers_url || `https://${slug}.recruitee.com/o/${job.slug}`,
      source:      "remote-es",
      postedAtRaw: job.published_at || null,
    }));
}

// ── Breezy HR ────────────────────────────────────────────────

function detectBreezy(url) {
  const m = url.match(/([a-z0-9-]+)\.breezy\.hr/i);
  return m ? m[1] : null;
}

async function fetchBreezy(slug, companyName, keywords) {
  const res = await fetch(`https://${slug}.breezy.hr/json`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return (data || [])
    .filter((job) => matchesAny(job.name, keywords))
    .map((job) => ({
      title:       job.name || "Untitled",
      company:     companyName,
      description: stripHtml(job.description || "").slice(0, 3000),
      link:        `https://${slug}.breezy.hr/p/${job.friendly_id}`,
      source:      "remote-es",
      postedAtRaw: job.published_date || null,
    }));
}

// ── TeamTailor ───────────────────────────────────────────────

function detectTeamTailor(url) {
  // Matches slug.teamtailor.com OR careers.company.com powered by TeamTailor
  const m = url.match(/([a-z0-9-]+)\.teamtailor\.com/i);
  return m ? m[1] : null;
}

async function fetchTeamTailor(slug, companyName, keywords) {
  const res = await fetch(
    `https://${slug}.teamtailor.com/jobs.json`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data?.data ?? [];

  return jobs
    .filter((job) => matchesAny(job?.attributes?.title, keywords))
    .map((job) => ({
      title:       job.attributes?.title || "Untitled",
      company:     companyName,
      description: stripHtml(job.attributes?.body || "").slice(0, 3000),
      link:        job.links?.["careersite-job-url"] || `https://${slug}.teamtailor.com`,
      source:      "remote-es",
      postedAtRaw: job.attributes?.["created-at"] || null,
    }));
}

// ── Factorial HR ─────────────────────────────────────────────

function detectFactorial(url) {
  const m = url.match(/([a-z0-9-]+)\.factorialhr\.(es|com)/i);
  return m ? { slug: m[1], tld: m[2] } : null;
}

async function fetchFactorial({ slug, tld }, companyName, keywords) {
  const res = await fetch(
    `https://${slug}.factorialhr.${tld}/api/2/ats/job_postings?status=published`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.data ?? []);

  return items
    .filter((job) => matchesAny(job.title, keywords))
    .map((job) => ({
      title:       job.title || "Untitled",
      company:     companyName,
      description: stripHtml(job.description || "").slice(0, 3000),
      link:        job.url || `https://${slug}.factorialhr.${tld}/jobs/${job.id}`,
      source:      "remote-es",
      postedAtRaw: job.created_at || null,
    }));
}

// ── Viterbit ─────────────────────────────────────────────────

function detectViterbit(url) {
  const m = url.match(/([a-z0-9-]+)\.viterbit\.site/i);
  return m ? m[1] : null;
}

async function fetchViterbit(slug, companyName, keywords) {
  const res = await fetch(
    `https://${slug}.viterbit.site/api/job-offer?status=published`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; JobScraper/1.0)" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.data ?? []);

  return items
    .filter((job) => matchesAny(job.title || job.name, keywords))
    .map((job) => ({
      title:       job.title || job.name || "Untitled",
      company:     companyName,
      description: stripHtml(job.description || "").slice(0, 3000),
      link:        `https://${slug}.viterbit.site/#jobs-${job.id}`,
      source:      "remote-es",
      postedAtRaw: job.created_at || null,
    }));
}

// ── Dispatcher ───────────────────────────────────────────────

/**
 * Try each platform in order. Returns the jobs array on a hit,
 * or null if the URL belongs to an unsupported platform.
 */
async function fetchCompanyJobs(companyName, url, keywords) {
  const ghSlug = detectGreenhouse(url);
  if (ghSlug) return fetchGreenhouse(ghSlug, companyName, keywords);

  const leverSlug = detectLever(url);
  if (leverSlug) return fetchLever(leverSlug, companyName, keywords);

  const workableSlug = detectWorkable(url);
  if (workableSlug) return fetchWorkable(workableSlug, companyName, keywords);

  const bambooSlug = detectBambooHR(url);
  if (bambooSlug) return fetchBambooHR(bambooSlug, companyName, keywords);

  const ashbySlug = detectAshby(url);
  if (ashbySlug) return fetchAshby(ashbySlug, companyName, keywords);

  const personioMatch = detectPersonio(url);
  if (personioMatch) return fetchPersonio(personioMatch, companyName, keywords);

  const recruiteeSlug = detectRecruitee(url);
  if (recruiteeSlug) return fetchRecruitee(recruiteeSlug, companyName, keywords);

  const breezySlug = detectBreezy(url);
  if (breezySlug) return fetchBreezy(breezySlug, companyName, keywords);

  const teamtailorSlug = detectTeamTailor(url);
  if (teamtailorSlug) return fetchTeamTailor(teamtailorSlug, companyName, keywords);

  const factorialMatch = detectFactorial(url);
  if (factorialMatch) return fetchFactorial(factorialMatch, companyName, keywords);

  const viterbitSlug = detectViterbit(url);
  if (viterbitSlug) return fetchViterbit(viterbitSlug, companyName, keywords);

  return null; // unsupported platform
}

// ── README list cache (module-level, lives for the process lifetime) ─────

let _companyListCache = null;

async function getCompanyList() {
  if (!_companyListCache) {
    _companyListCache = await fetchCompanyList();
  }
  return _companyListCache;
}

// ── Main Export ──────────────────────────────────────────────

/**
 * Fetch jobs from all companies in github.com/remote-es/remotes
 * whose titles match at least one of the provided keywords.
 *
 * @param {string[]} keywords  - Title keywords to match (e.g. ["frontend", "vue"])
 * @returns {Promise<object[]>}
 */
export async function fetchFromRemotees(keywords) {
  const companies = await getCompanyList();
  const total = companies.length;

  let supported = 0;
  let skipped   = 0;
  let errors    = 0;
  const allJobs = [];

  for (let i = 0; i < companies.length; i++) {
    const { name, url } = companies[i];
    await sleep(SLEEP_MS);

    try {
      const jobs = await fetchCompanyJobs(name, url, keywords);
      if (jobs === null) {
        skipped++;
      } else {
        supported++;
        allJobs.push(...jobs);
      }
    } catch {
      errors++;
    }

    // Progress indicator every 25 companies
    if ((i + 1) % 25 === 0 || i + 1 === total) {
      process.stdout.write(
        `\r     → remote-es: ${i + 1}/${total} companies checked, ${allJobs.length} job(s) found so far…`
      );
    }
  }

  // Clear the progress line and print the final summary
  process.stdout.write("\r" + " ".repeat(72) + "\r");
  console.log(
    `  ✅  remote-es: ${allJobs.length} job(s) from ${supported} supported companies` +
    (skipped > 0 ? ` (${skipped} skipped — unsupported platform)` : "") +
    (errors  > 0 ? ` (${errors} failed — API error)` : "")
  );

  return allJobs;
}
