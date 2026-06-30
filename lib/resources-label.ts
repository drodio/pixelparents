// Resources auto-labeling + pure input validators for the "living library".
//
// Two responsibilities, both DB-free so they're unit-testable in the node-only
// suite (see vitest.config.ts):
//
//  1. Pure validators/normalizers for a submitted resource (title, URL, note,
//     tags). Shared by the server action and the tests so the rules can't
//     silently diverge — mirrors lib/ask-validate.ts in shape.
//  2. `autoLabelResource` — generate 2-5 topic tags for a resource via the
//     Vercel AI Gateway (mirrors lib/enrichment/info-extract.ts's gateway/
//     Anthropic usage). It NEVER throws and NEVER blocks a submission: with no
//     model key (or any failure) it falls back to a cheap heuristic, so a
//     resource always gets *some* tags and submission is never gated on the AI.

// ---------------------------------------------------------------------------
// Limits + result types
// ---------------------------------------------------------------------------

export const RESOURCE_TITLE_MAX = 160;
export const RESOURCE_NOTE_MAX = 600;
export const RESOURCE_URL_MAX = 2048;
export const RESOURCE_TAGS_MAX = 5;
export const RESOURCE_TAG_MAX_LEN = 40;
// The AI is asked for AT LEAST this many, AT MOST RESOURCE_TAGS_MAX.
export const RESOURCE_TAGS_MIN = 2;

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string; field: string };
export type Result<T> = Ok<T> | Err;

// ---------------------------------------------------------------------------
// Text normalizers (mirrors lib/ask-validate.ts)
// ---------------------------------------------------------------------------

// Collapse whitespace + strip control chars from a single-line field (title).
function cleanLine(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize a multi-line field (note): CRLF→LF, strip control chars (except
// newline/tab), trim. Preserves paragraph breaks.
function cleanMultiline(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function validateResourceTitle(input: unknown): Result<string> {
  const v = cleanLine(input);
  if (!v) return { ok: false, error: "Add a title for this resource.", field: "title" };
  if (v.length > RESOURCE_TITLE_MAX)
    return {
      ok: false,
      error: `Title must be ${RESOURCE_TITLE_MAX} characters or fewer.`,
      field: "title",
    };
  return { ok: true, value: v };
}

// A note is optional context ("why this is worth your time"). Empty is allowed
// and normalizes to an empty string.
export function validateResourceNote(input: unknown): Result<string> {
  const v = cleanMultiline(input);
  if (v.length > RESOURCE_NOTE_MAX)
    return {
      ok: false,
      error: `Please keep the note under ${RESOURCE_NOTE_MAX} characters.`,
      field: "note",
    };
  return { ok: true, value: v };
}

// Validate + normalize a submitted URL. Only http(s) is accepted (no
// javascript:, data:, mailto:, file:, etc.) so a stored link can never be an
// XSS/exfil vector when rendered as an href. A bare "example.com" is upgraded
// to https://. Returns the canonical href string.
export function validateResourceUrl(input: unknown): Result<string> {
  const raw = cleanLine(input);
  if (!raw) return { ok: false, error: "Add a link to the resource.", field: "url" };
  if (raw.length > RESOURCE_URL_MAX)
    return { ok: false, error: "That link is too long.", field: "url" };

  // Upgrade a scheme-less host ("khanacademy.org/...") to https:// so a parser
  // doesn't misread it as a path. Anything already carrying a scheme is left
  // for the URL parser + allowlist check below.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link.", field: "url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Links must start with http:// or https://", field: "url" };
  }
  // A host is required (rejects "https:///foo" and similar).
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { ok: false, error: "That doesn't look like a valid link.", field: "url" };
  }
  return { ok: true, value: parsed.toString() };
}

// Sanitize + cap a free-text tag list (used for manual tags the author adds, and
// to clean AI/heuristic output before storage). Dedupes case-insensitively,
// trims each tag, drops empties, lowercases for a consistent filter key, and
// caps both per-tag length and the count. Never errors — extra tags are dropped.
export function normalizeResourceTags(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    if (typeof raw !== "string") continue;
    const t = cleanLine(raw).toLowerCase().slice(0, RESOURCE_TAG_MAX_LEN).trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= RESOURCE_TAGS_MAX) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tag filtering (pure — shared by the client list filter + tests)
// ---------------------------------------------------------------------------

// Filter a list of tag-bearing items to those carrying `tag`. A null/empty tag
// means "no filter" → the list is returned unchanged. Exact (case-sensitive)
// match against the stored tags, which are already lowercased at write time.
export function filterByTag<T extends { tags: string[] }>(
  items: readonly T[],
  tag: string | null,
): T[] {
  if (!tag) return [...items];
  return items.filter((item) => item.tags.includes(tag));
}

// ---------------------------------------------------------------------------
// Heuristic fallback labeler (DB-free, deterministic, no network)
// ---------------------------------------------------------------------------

// A small curated topic map: substring → canonical tag. Matched against the
// lowercased "title + note + url host" blob. Intentionally tiny and high-signal
// — this is the *fallback* when the AI is unavailable, not the primary path.
const TOPIC_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(math|calculus|algebra|geometry|trig)\b/, "math"],
  [/\b(physics|chemistry|biology|science|stem)\b/, "science"],
  [/\b(history|geography|civics|government)\b/, "history"],
  [/\b(english|writing|essays?|grammar|literature|reading)\b/, "writing"],
  [/\b(college|admission|application|scholarship|fafsa|sat|act)\b/, "college-prep"],
  [/\b(cod(e|ing)|programming|python|javascript|software|developer)\b/, "coding"],
  [/\b(ai|machine learning|ml|llm|neural)\b/, "ai"],
  [/\b(art|music|design|drawing|creative)\b/, "arts"],
  [/\b(career|internship|job|resume|interview)\b/, "career"],
  [/\b(mental health|wellbeing|wellness|stress|anxiety)\b/, "wellbeing"],
  [/\b(parent|parenting|family|guardian)\b/, "parenting"],
  [/\b(ohs|stanford|online high school)\b/, "ohs"],
  [/\b(course|class|lesson|tutorial|lecture|mooc)\b/, "course"],
  [/\b(video|youtube|talk|webinar)\b/, "video"],
  [/\b(book|guide|handbook|ebook)\b/, "guide"],
];

// Derive up to RESOURCE_TAGS_MAX heuristic tags from a resource's text. Always
// returns at least one tag (falls back to "resource") so a submission is never
// left tag-less. Pure + deterministic — easy to unit-test.
export function heuristicTags(input: {
  title: string;
  note?: string | null;
  url?: string | null;
}): string[] {
  let host = "";
  if (input.url) {
    try {
      host = new URL(input.url).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }
  }
  const blob = `${input.title} ${input.note ?? ""} ${host}`.toLowerCase();
  const tags: string[] = [];
  for (const [re, tag] of TOPIC_HINTS) {
    if (re.test(blob) && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= RESOURCE_TAGS_MAX) break;
  }
  if (tags.length === 0) tags.push("resource");
  return normalizeResourceTags(tags);
}

// ---------------------------------------------------------------------------
// AI auto-labeler (Vercel AI Gateway, mirrors lib/enrichment/info-extract.ts)
// ---------------------------------------------------------------------------

// Read env LAZILY (inside functions) — a serverless cold start may populate
// process.env (e.g. via dotenv) AFTER this module is imported.
const gwKey = () => process.env.VERCEL_AI_GATEWAY || process.env.AI_GATEWAY_API_KEY;
const antKey = () => process.env.ANTHROPIC_API_KEY;
const gwModel = () => process.env.ENRICHMENT_MODEL || "anthropic/claude-haiku-4-5";
const antModel = () => process.env.ENRICHMENT_MODEL || "claude-haiku-4-5-20251001";

export function hasModelKey(): boolean {
  return Boolean(gwKey() || antKey());
}

export type ResourceForLabel = {
  title: string;
  note?: string | null;
  url?: string | null;
};

function buildLabelPrompt(r: ResourceForLabel): string {
  return `You are tagging a learning resource shared in a Stanford Online High School parent + student community library. Generate ${RESOURCE_TAGS_MIN} to ${RESOURCE_TAGS_MAX} short, lowercase topic tags that describe what someone would LEARN from this resource (subjects, skills, or audience), so members can filter the library by topic.

Resource title: ${r.title}
${r.note ? `Author's note: ${r.note}\n` : ""}URL: ${r.url ?? "(none)"}

Rules:
- Output ONLY a JSON array of strings, e.g. ["math", "college-prep", "video"].
- ${RESOURCE_TAGS_MIN}-${RESOURCE_TAGS_MAX} tags. Each 1-3 words, lowercase, hyphenate multi-word tags (e.g. "college-prep").
- Topic/subject/skill/audience only. NO marketing words, NO "best"/"great", NO the author's name, NO personal data.
- Prefer broad, reusable tags over hyper-specific ones.`;
}

// Pull the first JSON array of strings out of a model response (tolerates prose
// or ```json fences around it).
function extractStringArray(text: string): string[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

// Override hook for tests: inject a fake model callable instead of hitting the
// network (mirrors ModelCall in lib/enrichment/info-extract.ts).
export type ModelCall = (prompt: string) => Promise<string>;

async function callModel(prompt: string): Promise<string> {
  const gw = gwKey();
  if (gw) {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${gw}` },
      body: JSON.stringify({
        model: gwModel(),
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`AI Gateway ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }
  const ant = antKey();
  if (ant) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ant,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: antModel(),
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? "";
  }
  throw new Error("No model key");
}

// Auto-label a resource with 2-5 topic tags. This is the function the submit
// action calls. It is DESIGNED NEVER TO THROW and never to block a submission:
//   • no model key, or any AI failure → heuristic fallback tags
//   • the model returns nothing usable → heuristic fallback tags
//   • the model returns tags          → sanitized + capped, padded from the
//                                        heuristic if it came back too short
// `model` is injectable for tests. Always returns at least one tag.
export async function autoLabelResource(
  r: ResourceForLabel,
  model: ModelCall = callModel,
): Promise<string[]> {
  const fallback = heuristicTags(r);
  if (!hasModelKey()) return fallback;

  let aiTags: string[] = [];
  try {
    const text = await model(buildLabelPrompt(r));
    aiTags = normalizeResourceTags(extractStringArray(text) ?? []);
  } catch {
    aiTags = [];
  }

  if (aiTags.length === 0) return fallback;

  // Pad a too-short AI result up to the minimum using heuristic tags (deduped),
  // so we always honor the 2-tag floor when possible.
  if (aiTags.length < RESOURCE_TAGS_MIN) {
    return normalizeResourceTags([...aiTags, ...fallback]);
  }
  return aiTags;
}
