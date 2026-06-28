import { generateText } from "ai";

// Cheap founder/investor-status classifier used to BACKFILL evaluations that
// were scored before the columns existed. New scores get both statuses from the
// main scoring call; this reads a profile's already-stored data and asks a small
// model to label it, without re-running the (expensive) full score.

export type Status = "current" | "past" | "never";

const MODEL = "anthropic/claude-haiku-4-5";

const PROMPT = `Classify this person on TWO INDEPENDENT dimensions. A person can be both a current founder AND a current investor. Reply with EXACTLY two lines and nothing else:
founder: <current|past|never>
investor: <current|past|never>

FOUNDER status (judge on company-founding history only; strong technical skills like GitHub/papers do NOT make someone a founder):
- current: actively running a company they founded, not yet exited.
- past: founded a company before but not now (it was acquired and they work there now / earnout, it shut down, or they moved to an operating/investing/IC role).
- never: no evidence they ever founded a company.

INVESTOR status (founding a company is NOT investing):
- current: actively invests now — GP/Partner/Principal at a VC/PE fund, active angel, or runs their own fund/syndicate.
- past: invested before but not now.
- never: no evidence they ever invested in startups/companies.

If evidence for a dimension is too thin to tell, answer 'never' for that dimension.`;

function parseOne(raw: string, key: "founder" | "investor"): Status | null {
  // Match the status word that follows the key (e.g. "investor: past"), so each
  // dimension reads only its own value — never the other line's.
  const m = (raw ?? "").toLowerCase().match(new RegExp(`${key}\\s*:?\\s*(current|past|never)`));
  return m ? (m[1] as Status) : null;
}

// Back-compat single-dimension parse (founder), still unit-tested.
export function parseFounderStatus(raw: string): Status | null {
  const t = (raw ?? "").toLowerCase();
  if (/\bnever\b/.test(t)) return "never";
  if (/\bcurrent\b/.test(t)) return "current";
  if (/\bpast\b/.test(t)) return "past";
  return null;
}

export function parseStatuses(raw: string): { founder: Status | null; investor: Status | null } {
  return { founder: parseOne(raw, "founder"), investor: parseOne(raw, "investor") };
}

export async function classifyStatuses(
  summary: string,
): Promise<{ founder: Status | null; investor: Status | null }> {
  const gen = await generateText({
    model: MODEL,
    temperature: 0,
    maxOutputTokens: 32,
    messages: [{ role: "user", content: `${PROMPT}\n\nPERSON:\n${summary}` }],
  });
  return parseStatuses(gen.text);
}
