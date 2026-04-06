# Job-Scraping Pipeline

An automated job-hunting pipeline with a web UI. It reads your CV, fetches job listings from multiple sources, evaluates each one with a local AI model, exports the best matches to a CSV file, and lets you review, enrich, generate cover letters, and apply — all from a browser dashboard.

---

## How It Works

```
CV + .env config
      │
      ▼
 Fetch Jobs ──► Deduplicate ──► Date & Keyword Filter
                                        │
                                        ▼
                               AI Evaluation (Ollama)
                               - CV ↔ job fit score
                               - Match decision
                               - Years of experience required
                                        │
                                        ▼
                              Experience Gate filter
                                        │
                                        ▼
                               Export matched_jobs.csv
                                        │
                                        ▼
                            ┌─── Web UI (localhost:3000) ───┐
                            │  Review & filter matches      │
                            │  Enrich job descriptions      │
                            │  Generate cover letters (AI)  │
                            │  One-click apply (Playwright) │
                            └───────────────────────────────┘
```

1. **Fetch** — Pulls listings from Google Jobs (via SerpApi), RemoteOK, Adzuna, Arbeitnow, Himalayas, Remotive, WeWorkRemotely, Jobicy, remote-es, Manfred, and Tecnoempleo across all configured queries and locations.
2. **Deduplicate & Filter** — Removes already-seen jobs (persisted in `job_history.json`), jobs older than the age limit, and jobs matching excluded keywords.
3. **AI Evaluation** — Each remaining job is sent to a local [Ollama](https://ollama.com/) model together with your CV. The model returns a fit score (1–10), a match decision, a one-sentence reason, and the years of experience explicitly required in the description.
4. **Experience Gate** — If `MAX_YEARS_EXPERIENCE` is set, any job requiring more years than the limit is discarded before the match check.
5. **Export** — Surviving matches are appended to `matched_jobs.csv`.
6. **Enrich** — Optionally fetch full job descriptions for listings that only have a summary (`npm run enrich`).
7. **Web UI** — Browse, filter, and act on matches from a browser dashboard at `localhost:3000`. Generate AI cover letters, open job pages, and trigger Playwright-based auto-apply — all from the UI.
8. **Apply** — One-click or interactive application flow using Playwright to open job pages and auto-fill forms with your profile data.

---

## Requirements

| Dependency | Purpose |
|---|---|
| [Node.js](https://nodejs.org/) ≥ 18 | Runtime (`fetch` built-in) |
| [Ollama](https://ollama.com/) | Local AI inference + cover letter generation |
| [SerpApi](https://serpapi.com/) key | Google Jobs / search engines |
| Adzuna keys *(optional)* | Additional job source |
| [Playwright](https://playwright.dev/) *(auto-installed)* | Browser automation for auto-apply |

---

## Setup

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install and start Ollama

```bash
# macOS
brew install ollama
ollama serve

# Pull a model (llama3.2 is the default)
ollama pull llama3.2
```

### 3. Configure environment variables

Copy `.env` and fill in your keys:

```bash
cp .env .env.local   # or just edit .env directly
```

See the [Environment Variables](#environment-variables) section for all options.

### 4. Add your CV

Paste your CV as plain text into `cv.txt` at the project root.

### 5. Run the pipeline

```bash
npm start
```

Matches are written to `matched_jobs.csv`.

### 6. Launch the Web UI

```bash
npm run ui
```

Open [http://localhost:3000](http://localhost:3000) to browse matches, generate cover letters, and apply.

### 7. Enrich descriptions (optional)

```bash
npm run enrich
```

Fetches full job descriptions for listings that only have a summary.

### 8. Interactive apply (CLI, optional)

```bash
npm run apply
```

Walks through matched jobs one by one in the terminal with Playwright-powered auto-apply.

---

## Environment Variables

### AI (Ollama)

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2` | Model to use. Run `ollama list` to see installed models. Popular choices: `llama3.2`, `llama3.1`, `mistral`, `phi3` |

### APIs

| Variable | Required | Description |
|---|---|---|
| `SERPAPI_API_KEY` | ✅ Yes | SerpApi key — [get one here](https://serpapi.com/) |
| `ADZUNA_APP_ID` | No | Adzuna app ID — [get one here](https://developer.adzuna.com/) |
| `ADZUNA_APP_KEY` | No | Adzuna app key |

### Job Sources

| Variable | Default | Description |
|---|---|---|
| `JOB_SOURCES` | `google_jobs,remoteok` | Comma-separated list of sources. **Free (no key):** `google_jobs`, `remoteok`, `arbeitnow`, `jobicy`, `himalayas`, `remotive`, `weworkremotely`, `remotees`, `manfred`, `tecnoempleo`. **Paid SerpApi:** `adzuna`, `linkedin_jobs`, `indeed_jobs`, `glassdoor` |

### Search Parameters

| Variable | Default | Description |
|---|---|---|
| `JOB_QUERIES` | — | Comma-separated search terms, e.g. `frontend developer,react developer`. Each query × location = 1 API call. |
| `JOB_LOCATIONS` | `United States` | Comma-separated locations, e.g. `Spain,Madrid,Barcelona`. More locations = more API calls. |
| `JOB_EXCLUDE_KEYWORDS` | — | Comma-separated keywords (case-insensitive). Jobs whose title/description contain any of these are discarded before AI evaluation. |
| `JOB_REMOTE_KEYWORDS` | — | Comma-separated keywords used to mark a job as remote (e.g. `remote,remoto,wfh`). |

### Filters

| Variable | Default | Description |
|---|---|---|
| `MAX_YEARS_EXPERIENCE` | `0` (disabled) | Maximum years of experience a job may require. Jobs explicitly asking for more are skipped. Set to `0` to disable the filter. |

---

## Output

### `matched_jobs.csv`

Each row represents a job that passed all filters and was deemed a match by the AI:

| Column | Description |
|---|---|
| `title` | Job title |
| `company` | Company name |
| `source` | Fetcher that found it (`google_jobs`, `remoteok`, `adzuna`) |
| `isRemote` | `true` / `false` |
| `postedAt` | Posting date (if available) |
| `link` | Direct URL to the listing |
| `score` | AI fit score (1–10) |
| `reason` | One-sentence explanation from the AI |

### `job_history.json`

Stores URLs of all previously fetched jobs so they are not re-evaluated on subsequent runs.

---

## Project Structure

```
job-scraping/
├── index.js                  # Entry point / pipeline orchestration
├── server.js                 # Web UI server (Express)
├── apply.js                  # Interactive CLI apply flow
├── enrich.js                 # Standalone description enricher
├── cv.txt                    # Your CV (plain text)
├── profile.json              # Your profile data (for auto-apply)
├── matched_jobs.csv          # Output — matched job listings
├── job_history.json          # Seen-jobs cache
├── package.json
├── .env                      # Environment variables
├── public/
│   └── index.html            # Web UI frontend
└── src/
    ├── config.js             # Constants and env validation
    ├── cv.js                 # CV loader
    ├── coverLetter.js        # AI cover letter generation (Ollama)
    ├── dateParser.js         # Posted-date normalisation
    ├── enricher.js           # Job description enrichment
    ├── evaluator.js          # Ollama AI evaluation
    ├── exporter.js           # CSV export
    ├── fetcher.js            # Orchestration, dedup, and filtering
    ├── formFiller.js         # Playwright form auto-fill logic
    ├── applier.js            # Playwright-based job application
    ├── history.js            # Job history persistence
    └── fetchers/
        ├── adzuna.js         # Adzuna API client (EU jobs, requires API key)
        ├── arbeitnow.js      # Arbeitnow client (European jobs, free)
        ├── himalayas.js      # Himalayas client (remote jobs, free)
        ├── jobicy.js         # Jobicy client (remote jobs, free)
        ├── manfred.js        # Manfred client (Spanish tech jobs, free)
        ├── remotees.js       # remote-es client (Spanish remote company boards, free)
        ├── remoteok.js       # RemoteOK API client (remote jobs, free)
        ├── remotive.js       # Remotive API client (remote software-dev jobs, free)
        ├── serpapi.js        # SerpApi client (Google Jobs, LinkedIn, etc.)
        ├── tecnoempleo.js    # Tecnoempleo client (Spanish tech jobs, free)
        └── weworkremotely.js # We Work Remotely RSS feed (remote programming jobs, free)
```

---

## Tips

- **Start narrow** — a few focused queries (`react developer`, `junior frontend`) produce better results than broad ones.
- **Use `JOB_EXCLUDE_KEYWORDS`** aggressively to cut irrelevant roles before they reach the AI (saves time and API calls).
- **`google_jobs` already aggregates** LinkedIn, Indeed, and Glassdoor — no need to enable those separately unless you have a paid SerpApi plan.
- **`arbeitnow`** is the best free source for European jobs (Spain, Germany, France). No API key needed.
- **`jobicy` and `himalayas`** are global remote-only boards with good English-language listings. No API key needed.
- **`remotive`** covers the `software-dev` category with curated remote roles. No API key needed.
- **`weworkremotely`** is one of the oldest and most trusted remote programming job boards. Fetched via RSS, no API key needed.
- **`remotees`** crawls company career pages listed on remote-es.com — great for finding Spanish remote positions not posted on mainstream boards.
- **`manfred`** and **`tecnoempleo`** are Spanish tech job boards. Good for Spain-based roles, no API key needed.
- **For LinkedIn jobs** use the existing `linkedin_jobs` SerpApi engine (paid plan required) rather than unofficial scrapers.
- **Ollama model size vs. speed** — `llama3.2` (3 B) is fast; `llama3.1` (8 B) or `mistral` offer better accuracy at the cost of slower inference.
- **Re-running** is safe — seen jobs are skipped automatically via `job_history.json`.

---

## License

MIT
