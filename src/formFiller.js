// ─────────────────────────────────────────────────────────────
// Form Filler — maps profile fields to detected form inputs
// ─────────────────────────────────────────────────────────────

/**
 * Common field label patterns → profile keys.
 * Matched case-insensitively against input labels, placeholders, name attrs.
 */
const FIELD_MAP = [
  { keys: ["first name", "firstname", "given name"],         value: p => p.firstName },
  { keys: ["last name", "lastname", "surname", "family name"], value: p => p.lastName },
  { keys: ["full name", "your name", "name"],                value: p => `${p.firstName} ${p.lastName}` },
  { keys: ["email", "e-mail", "correo"],                     value: p => p.email },
  { keys: ["phone", "telephone", "mobile", "teléfono"],      value: p => p.phone },
  { keys: ["location", "city", "ciudad", "address"],         value: p => p.location },
  { keys: ["linkedin"],                                       value: p => p.linkedin },
  { keys: ["github"],                                         value: p => p.github },
  { keys: ["portfolio", "website", "personal site"],         value: p => p.portfolio },
  { keys: ["current title", "job title", "position"],        value: p => p.currentTitle },
  { keys: ["years of experience", "experience"],             value: p => String(p.yearsExperience) },
  { keys: ["salary", "compensation", "salary expectation"],  value: p => p.salaryExpectation },
  { keys: ["notice period", "availability"],                 value: p => p.noticePeriod },
  { keys: ["cover letter", "carta de presentación"],         value: (_, coverLetter) => coverLetter },
];

/**
 * Attempt to fill a single Playwright page with profile data + cover letter.
 * Uses label text, placeholder, name, and aria-label to identify fields.
 * Skips fields where no matching value is found.
 *
 * @param {import('playwright').Page} page
 * @param {object} profile - Contents of profile.json
 * @param {string} coverLetter - Generated cover letter text
 * @returns {Promise<number>} Number of fields successfully filled
 */
export async function fillForm(page, profile, coverLetter) {
  let filled = 0;

  const inputs = await page.$$("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea");

  for (const input of inputs) {
    const hint = await getFieldHint(page, input);
    if (!hint) continue;

    const match = FIELD_MAP.find(entry =>
      entry.keys.some(k => hint.toLowerCase().includes(k))
    );
    if (!match) continue;

    const value = match.value(profile, coverLetter);
    if (!value) continue;

    try {
      await input.scrollIntoViewIfNeeded();
      await input.click({ clickCount: 3 });
      await input.fill(value);
      filled++;
    } catch {
      // Non-fatal: some inputs may be read-only or behind frameworks
    }
  }

  // Handle <select> dropdowns for work authorization
  const selects = await page.$$("select");
  for (const select of selects) {
    const hint = await getFieldHint(page, select);
    if (!hint) continue;

    if (/work.?auth|visa|authorized|eligible/i.test(hint)) {
      try {
        // Try to select a "yes" / authorized option
        const options = await select.$$("option");
        for (const opt of options) {
          const text = await opt.innerText();
          if (/yes|authorized|eligible|citizen|permanent/i.test(text)) {
            await select.selectOption({ label: text.trim() });
            filled++;
            break;
          }
        }
      } catch {
        // Non-fatal
      }
    }
  }

  return filled;
}

/**
 * Get a human-readable hint for a form element by checking its associated
 * label, placeholder, aria-label, name, and id attributes.
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').ElementHandle} element
 * @returns {Promise<string>}
 */
async function getFieldHint(page, element) {
  const hints = [];

  // Associated <label>
  try {
    const id = await element.getAttribute("id");
    if (id) {
      const label = await page.$(`label[for="${id}"]`);
      if (label) hints.push(await label.innerText());
    }
  } catch {}

  // aria-label, placeholder, name, id
  for (const attr of ["aria-label", "placeholder", "name", "id"]) {
    try {
      const val = await element.getAttribute(attr);
      if (val) hints.push(val);
    } catch {}
  }

  return hints.join(" ");
}
