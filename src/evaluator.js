// ─────────────────────────────────────────────────────────────
// Evaluator — AI-powered job/CV matching via Ollama
// ─────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || "llama3.2";

const SYSTEM_PROMPT = `You are an expert tech recruiter. You will receive a candidate's CV and a job listing.

Your task:
1. Compare the candidate's skills, experience, and background against the job requirements.
2. Decide whether the candidate is a good fit.
3. Extract the minimum years of experience explicitly required in the job description (e.g. "3+ years", "at least 5 years"). If no specific requirement is mentioned, set yearsRequired to null.
4. Respond with ONLY a JSON object — no markdown fences, no extra text.

Required JSON structure:
{
  "isMatch": <boolean>,
  "score": <number 1-10>,
  "reason": "<one-sentence explanation>",
  "yearsRequired": <number | null>
}

Scoring guide:
- 1-3: Poor fit (missing most requirements)
- 4-6: Partial fit (some overlap)
- 7-8: Good fit (meets most requirements)
- 9-10: Excellent fit (exceeds requirements)`;

/**
 * Send a job listing + CV to Ollama and return a structured evaluation.
 *
 * @param {{ title: string, company: string, description: string }} job
 * @param {string} cv
 * @returns {Promise<{ isMatch: boolean, score: number, reason: string }>}
 */
export async function evaluateJob(job, cv) {
  const userMessage =
    `## Candidate CV\n${cv}\n\n` +
    `## Job Listing\n` +
    `**Title:** ${job.title}\n` +
    `**Company:** ${job.company}\n` +
    `**Description:** ${job.description}`;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:  OLLAMA_MODEL,
        prompt: `${SYSTEM_PROMPT}\n\n${userMessage}`,
        stream: false,
        format: "json",
        options: {
          temperature: 0.2, // Low temp for consistent, deterministic scoring
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
    }

    const data   = await response.json();
    const result = JSON.parse(data.response);

    if (
      typeof result.isMatch !== "boolean" ||
      typeof result.score   !== "number"  ||
      typeof result.reason  !== "string"
    ) {
      throw new Error("AI response missing required fields");
    }

    // Normalise yearsRequired: accept number or null only
    if (result.yearsRequired !== null && typeof result.yearsRequired !== "number") {
      result.yearsRequired = null;
    }

    return result;
  } catch (err) {
    console.error(`   ⚠️  AI evaluation failed for "${job.title}": ${err.message}`);
    // Safe default — keeps the pipeline running even on transient errors
    return { isMatch: false, score: 0, reason: "Evaluation failed — see logs.", yearsRequired: null };
  }
}
