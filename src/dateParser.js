// ─────────────────────────────────────────────────────────────
// Date Parser — normalise raw posted-date values to Date objects
// ─────────────────────────────────────────────────────────────

/**
 * Parse a raw posted-date value into a Date object.
 *
 * Handles:
 *  - Relative strings  : "2 days ago", "3 weeks ago", "an hour ago", "just posted"
 *  - ISO date strings  : "2024-01-15T10:30:00Z"
 *  - Unix epoch seconds: number (as returned by RemoteOK)
 *
 * @param {string|number|null|undefined} raw
 * @returns {Date|null}
 */
export function parsePostedDate(raw) {
  if (raw === null || raw === undefined || raw === "") return null;

  // Unix timestamp — RemoteOK returns epoch seconds as a number
  if (typeof raw === "number") {
    return new Date(raw * 1000);
  }

  const str = String(raw).trim().toLowerCase();

  // "just posted", "today", "active today"
  if (/just posted|^today$|active today/.test(str)) {
    return new Date();
  }

  // Relative string: "2 days ago", "an hour ago", "1 week ago", "3 months ago"
  const relMatch = str.match(/(\d+|an?)\s+(hour|day|week|month)s?\s+ago/);
  if (relMatch) {
    const amount =
      relMatch[1] === "a" || relMatch[1] === "an"
        ? 1
        : parseInt(relMatch[1], 10);

    const unitMs = {
      hour:  3_600_000,
      day:   86_400_000,
      week:  7 * 86_400_000,
      month: 30 * 86_400_000,
    };

    return new Date(Date.now() - amount * unitMs[relMatch[2]]);
  }

  // ISO or any other parseable date string
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}
