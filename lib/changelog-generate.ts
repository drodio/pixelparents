// Turn a batch of git commits into structured changelog events via an LLM.
//
// DB-free + unit-testable (mirrors lib/resources-label.ts): the model callable
// is injectable, and this module NEVER touches the database or throws — on any
// model failure it returns [] so the cron no-ops gracefully.
//
// Design notes:
//  • The LLM decides how many entries and how to aggregate (told to minimize
//    aggressively), but AUTHOR ATTRIBUTION IS COMPUTED IN CODE from the commit
//    list — the model is never trusted to invent authors/logins.
//  • Every input SHA is assigned to exactly one event so its author(s) are
//    attributable; leftovers the model drops are folded into a final
//    "Minor fixes and tweaks" entry so nothing is silently lost.

import { CHANGELOG_CATEGORIES, slugify, type ChangeType } from "@/lib/changelog";
import type { RecentCommit } from "@/lib/github";

// Reuse the exact gateway/fallback approach + injectable-model pattern from
// lib/resources-label.ts so this stays consistent and unit-testable.
const gwKey = () => process.env.VERCEL_AI_GATEWAY || process.env.AI_GATEWAY_API_KEY;
const antKey = () => process.env.ANTHROPIC_API_KEY;
const gwModel = () => process.env.ENRICHMENT_MODEL || "anthropic/claude-haiku-4-5";
const antModel = () => process.env.ENRICHMENT_MODEL || "claude-haiku-4-5-20251001";

export function hasModelKey(): boolean {
  return Boolean(gwKey() || antKey());
}

// Injectable for tests (mirrors ModelCall in lib/resources-label.ts).
export type ModelCall = (prompt: string) => Promise<string>;

const VALID_CHANGE_TYPES: ReadonlySet<string> = new Set<ChangeType>([
  "feature",
  "enhancement",
  "bug_fix",
]);
const VALID_CATEGORY_SLUGS: ReadonlySet<string> = new Set(
  CHANGELOG_CATEGORIES.map((c) => c.slug),
);

// A single author credit — display name + GitHub login (login null when the
// commit isn't linked to a GH account; the UI then shows just the name).
export type Author = { name: string; login: string | null };

// A fully-resolved changelog event ready to insert. `commitShas` is the set of
// input SHAs this event aggregates; `commitSha` is the representative (newest).
export type GeneratedEntry = {
  slug: string;
  shippedAt: string; // ISO — newest commit date among its SHAs
  title: string;
  summary: string;
  bullets: string[];
  changeType: ChangeType;
  categories: string[];
  authors: Author[];
  commitShas: string[];
  commitSha: string; // representative (newest) sha
};

// What we ask the model to return per event (author attribution excluded — we
// compute that in code from commitShas).
type ModelEvent = {
  title: string;
  summary: string;
  bullets: string[];
  changeType: ChangeType;
  categories: string[];
  commitShas: string[];
};

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(commits: RecentCommit[]): string {
  const commitBlock = commits
    .map((c) => {
      const short = c.sha.slice(0, 7);
      const body = c.body ? `\n  ${c.body.replace(/\n+/g, " ").slice(0, 300)}` : "";
      return `- sha: ${short}\n  title: ${c.title}${body}`;
    })
    .join("\n");

  const categorySlugs = CHANGELOG_CATEGORIES.map((c) => c.slug).join(", ");

  return `You are writing the PUBLIC changelog for Pixel Parents, an app used by Stanford Online High School parents and students. Below are git commits merged since the last update. Turn them into a small set of user-facing changelog entries.

Commits (each has a 7-char sha, a title, and maybe a short body):
${commitBlock}

Rules — READ CAREFULLY:
- MINIMIZE the number of entries. Aggregate aggressively:
  - Many small fixes/tweaks -> ONE "Minor fixes and tweaks" entry.
  - A large multi-commit effort (e.g. a visual overhaul spanning 15 commits) -> ONE entry with a few highlight bullets.
  - Vary the number of entries with the volume of MEANINGFUL change, not the raw commit count.
- Fold pure chore/CI/test/dependency/refactor commits into a single minor entry, or omit them.
- Write for parents and students: plain, non-technical language. No internal jargon, no file names, no code identifiers.
- NEVER include people's names, emails, usernames, or secrets in any text.
- Each entry: a crisp title, a 1-2 sentence summary, and up to 3 highlight bullets.
- Assign EVERY provided sha to exactly ONE entry via its "commitShas" list (use the 7-char shas shown above). Do not invent shas.

Output ONLY a JSON array (no prose, no code fences). Each element:
{
  "title": string,
  "summary": string,
  "bullets": string[] (0-3),
  "changeType": "feature" | "enhancement" | "bug_fix",
  "categories": string[] (0-3 slugs from: ${categorySlugs}),
  "commitShas": string[] (the 7-char shas this entry covers)
}`;
}

// ---------------------------------------------------------------------------
// Tolerant JSON parsing
// ---------------------------------------------------------------------------

// Pull the first JSON array of objects out of a model response (tolerates prose
// or ```json fences around it). Returns [] if nothing parseable.
function extractEvents(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

// Coerce one raw model object into a ModelEvent, dropping anything invalid.
function coerceEvent(raw: unknown): ModelEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = asString(o.title);
  if (!title) return null;
  const changeTypeRaw = asString(o.changeType);
  const changeType = (VALID_CHANGE_TYPES.has(changeTypeRaw) ? changeTypeRaw : "enhancement") as ChangeType;
  const categories = asStringArray(o.categories)
    .filter((c) => VALID_CATEGORY_SLUGS.has(c))
    .slice(0, 3);
  return {
    title,
    summary: asString(o.summary),
    bullets: asStringArray(o.bullets).slice(0, 3),
    changeType,
    categories,
    // Normalize shas to lowercase for prefix matching against full SHAs.
    commitShas: asStringArray(o.commitShas).map((s) => s.toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// Author attribution (IN CODE — never from the model)
// ---------------------------------------------------------------------------

// Dedupe authors by login (falling back to lowercased name when login is null),
// preserving first-seen order. Never invents authors.
function dedupeAuthors(commits: RecentCommit[]): Author[] {
  const out: Author[] = [];
  const seen = new Set<string>();
  for (const c of commits) {
    const key = c.authorLogin ? `login:${c.authorLogin.toLowerCase()}` : `name:${c.authorName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: c.authorName, login: c.authorLogin });
  }
  return out;
}

// Newest commit date among a set of commits, as ISO. Falls back to now.
function newestDate(commits: RecentCommit[]): string {
  let best = 0;
  for (const c of commits) {
    const t = Date.parse(c.date);
    if (!Number.isNaN(t) && t > best) best = t;
  }
  return best > 0 ? new Date(best).toISOString() : new Date().toISOString();
}

// The newest commit's full sha (representative for the entry).
function representativeSha(commits: RecentCommit[]): string {
  let best = commits[0];
  let bestT = Date.parse(best?.date ?? "");
  for (const c of commits) {
    const t = Date.parse(c.date);
    if (!Number.isNaN(t) && (Number.isNaN(bestT) || t > bestT)) {
      best = c;
      bestT = t;
    }
  }
  return best?.sha ?? "";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

// Build structured changelog events from commits. Author attribution, dates,
// slugs, and leftover-folding are all computed here in code. Returns [] on any
// model failure or with no commits (NEVER throws).
export async function generateChangelogEntries(
  commits: RecentCommit[],
  model: ModelCall = callModel,
): Promise<GeneratedEntry[]> {
  if (commits.length === 0) return [];
  if (!hasModelKey()) return [];

  let modelEvents: ModelEvent[] = [];
  try {
    const text = await model(buildPrompt(commits));
    modelEvents = extractEvents(text)
      .map(coerceEvent)
      .filter((e): e is ModelEvent => e !== null);
  } catch (err) {
    console.error("generateChangelogEntries model call failed:", err);
    return [];
  }

  // Index commits by full sha for lookup, and track which are still unassigned.
  const bySha = new Map<string, RecentCommit>();
  for (const c of commits) bySha.set(c.sha.toLowerCase(), c);
  const unassigned = new Set(bySha.keys());

  // Resolve a model-provided (possibly short) sha to a full sha we know, but
  // only if it's still unassigned — so each commit lands in exactly one entry.
  function resolve(shaish: string): string | null {
    const s = shaish.toLowerCase();
    if (bySha.has(s) && unassigned.has(s)) return s;
    // Prefix match (the model was shown 7-char shas).
    for (const full of unassigned) {
      if (full.startsWith(s) || s.startsWith(full)) return full;
    }
    return null;
  }

  const entries: GeneratedEntry[] = [];
  const usedSlugs = new Set<string>();

  function makeSlug(title: string, repSha: string): string {
    const base = slugify(title) || "update";
    const suffix = repSha.slice(0, 7);
    let slug = `${base}-${suffix}`;
    // Guarantee uniqueness within this batch even if two events share a title.
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${suffix}-${n++}`;
    usedSlugs.add(slug);
    return slug;
  }

  for (const ev of modelEvents) {
    const evCommits: RecentCommit[] = [];
    for (const shaish of ev.commitShas) {
      const full = resolve(shaish);
      if (!full) continue;
      unassigned.delete(full);
      const c = bySha.get(full);
      if (c) evCommits.push(c);
    }
    // Skip an event the model tied to no real (still-unassigned) commit — we
    // can't attribute authors to it and it would carry no dedupe key.
    if (evCommits.length === 0) continue;

    const repSha = representativeSha(evCommits);
    entries.push({
      slug: makeSlug(ev.title, repSha),
      shippedAt: newestDate(evCommits),
      title: ev.title,
      summary: ev.summary,
      bullets: ev.bullets,
      changeType: ev.changeType,
      categories: ev.categories,
      authors: dedupeAuthors(evCommits),
      commitShas: evCommits.map((c) => c.sha),
      commitSha: repSha,
    });
  }

  // Fold any leftover commits the model dropped into one minor entry so nothing
  // is silently lost and every author stays attributable.
  if (unassigned.size > 0) {
    const leftovers = [...unassigned].map((s) => bySha.get(s)!).filter(Boolean);
    const repSha = representativeSha(leftovers);
    entries.push({
      slug: makeSlug("Minor fixes and tweaks", repSha),
      shippedAt: newestDate(leftovers),
      title: "Minor fixes and tweaks",
      summary: "A batch of small fixes and behind-the-scenes improvements.",
      bullets: [],
      changeType: "bug_fix",
      categories: [],
      authors: dedupeAuthors(leftovers),
      commitShas: leftovers.map((c) => c.sha),
      commitSha: repSha,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Model call — same gateway/Anthropic-fallback approach as lib/resources-label.ts
// ---------------------------------------------------------------------------

async function callModel(prompt: string): Promise<string> {
  const gw = gwKey();
  if (gw) {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${gw}` },
      body: JSON.stringify({
        model: gwModel(),
        max_tokens: 1500,
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
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? "";
  }
  throw new Error("No model key");
}
