// ─────────────────────────────────────────────────────────────
// Cover Letter Generator — per-job, via Ollama
// ─────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || "llama3.2";

const SYSTEM_PROMPT = `You are an expert career coach. Write a concise, professional cover letter tailored to the specific job listing provided.

Rules:
- 3 paragraphs, maximum 250 words total
- Paragraph 1: Express genuine interest in the specific role and company; reference something concrete from the job description
- Paragraph 2: Highlight 2-3 specific skills or experiences from the CV that directly match the job requirements
- Paragraph 3: Short, confident closing with a call to action
- Do NOT use generic filler phrases like "I am writing to express my interest"
- Do NOT include subject line, date, address headers, or sign-off
- Output ONLY the cover letter body text`;

/**
 * Generate a tailored cover letter for a specific job using the candidate's CV.
 *
 * @param {{ title: string, company: string, description: string }} job
 * @param {string} cv - Full CV text
 * @returns {Promise<string>} Cover letter body text
 */
export async function generateCoverLetter(job, cv) {
  const userMessage =
    `## Candidate CV\n${cv}\n\n` +
    `## Job Listing\n` +
    `**Title:** ${job.title}\n` +
    `**Company:** ${job.company}\n` +
    `**Description:** ${job.description}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:  OLLAMA_MODEL,
      prompt: `${SYSTEM_PROMPT}\n\n${userMessage}`,
      stream: false,
      options: {
        temperature: 0.7, // Higher temp for natural, varied prose
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response.trim();
}
