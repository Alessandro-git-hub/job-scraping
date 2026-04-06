// ─────────────────────────────────────────────────────────────
// Applier — opens a single browser session per job and pre-fills the form
// ─────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { generateCoverLetter } from "./coverLetter.js";
import { fillForm } from "./formFiller.js";
import { loadCV } from "./cv.js";

/**
 * Open a browser, navigate to the job application URL, generate a cover letter,
 * and attempt to pre-fill the form. Keeps the browser open for human review.
 * Resolves when the user presses ENTER in the terminal (or sends the resolve signal).
 *
 * @param {object} job         - Job row from matched_jobs.csv
 * @param {object} profile     - Contents of profile.json
 * @param {Function} onReady   - Called after form fill; receives { coverLetter, filledCount }
 * @returns {Promise<void>}
 */
export async function applyToJob(job, profile, onReady) {
  const cv = loadCV();

  console.log(`\n  Generating cover letter for "${job.title}" at ${job.company}…`);
  const coverLetter = await generateCoverLetter(job, cv);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  console.log(`  Opening: ${job.link}`);
  await page.goto(job.link, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Try to click through to the actual apply form
  await clickApplyButton(page);

  // Wait briefly for any redirect / SPA navigation to settle
  await page.waitForTimeout(2000);

  // Attempt to fill in the form fields
  const filledCount = await fillForm(page, profile, coverLetter);

  // Hand off to the caller (queue runner) so it can prompt the user
  await onReady({ coverLetter, filledCount, page, browser });

  await browser.close();
}

/**
 * Open a browser, navigate to the job URL, and pre-fill the form with an
 * already-generated cover letter. Used by the web UI server.
 * The caller is responsible for closing the returned browser.
 *
 * @param {{ title: string, company: string, description: string, link: string }} job
 * @param {object} profile     - Contents of profile.json
 * @param {string} coverLetter - Already-generated cover letter text
 * @returns {Promise<{ browser: import('playwright').Browser, filledCount: number }>}
 */
export async function openAndFill(job, profile, coverLetter) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  console.log(`  Opening: ${job.link}`);
  await page.goto(job.link, { waitUntil: "domcontentloaded", timeout: 30_000 });

  await clickApplyButton(page);
  await page.waitForTimeout(2000);

  const filledCount = await fillForm(page, profile, coverLetter);
  console.log(`  ${filledCount} field(s) pre-filled`);

  return { browser, filledCount };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Best-effort click on an "Apply" button/link.
 * Tries several common label patterns; silently ignores if none found.
 *
 * @param {import('playwright').Page} page
 */
async function clickApplyButton(page) {
  const selectors = [
    "a:has-text('Apply now')",
    "a:has-text('Apply')",
    "button:has-text('Apply now')",
    "button:has-text('Apply')",
    "[data-automation='job-detail-apply']",
    ".apply-button",
    "#apply-button",
    "a:has-text('Inscribirme')",
    "a:has-text('Aplicar')",
    "button:has-text('Aplicar')",
  ];

  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        return;
      }
    } catch {
      // Try next selector
    }
  }
}
