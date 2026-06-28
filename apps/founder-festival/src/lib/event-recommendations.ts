// Reframe a member's existing "priorities" recommendations into proposed IRL
// Festival events. This is a cheap, recommendations-ONLY pass over a profile's
// already-stored data (no Exa, no full re-score): it feeds Sonnet the member's
// existing priorities + summary and asks it to convert each into a concrete
// event they'd want to attend, reusing the exact `evaluations.recommendations`
// shape so the DB column, the 1-4 ratings, and the Public/Private toggle all
// keep working untouched.
//
// Example reframe (priority -> event):
//   "Use SPC office hours to pressure-test 2-3 AI product theses"
//     -> "An SPC dinner with other top-ranked SPC members to pressure-test 2-3
//         AI product theses"

import { generateText } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, recommendationResponses, recommendationVisibility, scoringRuns } from "@/db/schema";

// Same six categories as the scoring rubric — they describe the event's purpose
// and still apply (a fundraising dinner, a hiring happy-hour, etc.).
export const EVENT_REC_CATEGORIES = [
  "fundraising",
  "hiring",
  "intros",
  "tactical",
  "positioning",
  "wellbeing",
] as const;

const EventRecSchema = z.object({
  summary: z.string(),
  items: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        category: z.enum(EVENT_REC_CATEGORIES),
      }),
    )
    .min(1),
});
export type EventRecommendations = z.infer<typeof EventRecSchema>;

const MODEL_ID = {
  sonnet: "anthropic/claude-sonnet-4-6",
  haiku: "anthropic/claude-haiku-4-5",
  opus: "anthropic/claude-opus-4-7",
} as const;
export type EventRecModel = keyof typeof MODEL_ID;

// Stored recommendations shape (what's already on evaluations.recommendations).
type StoredRecs = {
  summary?: string | null;
  items?: Array<{ id?: string; text?: string; category?: string }>;
};

// Mirrors eval-pipeline's extractJsonObject: tolerate ```json fences and find
// the first balanced top-level {...}.
function extractJsonObject(text: string): unknown {
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Unbalanced braces in response JSON");
  return JSON.parse(s.slice(start, end + 1));
}

function buildPrompt(input: {
  fullName: string | null;
  summary: string | null;
  priorities: Array<{ text: string; category: string }>;
}): string {
  const priorityLines = input.priorities
    .map((p, i) => `${i + 1}. [${p.category}] ${p.text}`)
    .join("\n");
  return `You design IRL events for "Founder Festival", an invite-only community of top founders and investors. Members get invited to small, high-signal in-real-life gatherings (dinners, office hours, roundtables, happy hours, networking nights).

Below is a member's profile summary and their current priorities. Convert these into 5-8 SPECIFIC Festival events this person would genuinely want to attend, each derived from their priorities and profile.

Member: ${input.fullName ?? "(name unknown)"}
What they likely need right now: ${input.summary ?? "(no summary)"}
Their current priorities:
${priorityLines || "(none provided)"}

Rules for each event:
- Phrase it as a concrete gathering they could attend. Start with "A" or "An" (e.g. "An SPC dinner…", "A YC W09/S11 founder dinner…").
- KEEP the specific hooks from their priorities — named YC batches (e.g. "W09/S11"), communities (e.g. "SPC"), rankings (e.g. "#1 HN Tokenmaxxing"), companies, alumni networks. Specificity is the entire point; never make it generic.
- One sentence, no trailing period needed.
- Pick the single best-fit category from: fundraising | hiring | intros | tactical | positioning | wellbeing.
- Give each a short stable slug id (lowercase, hyphenated, derived from the event, e.g. "spc-ai-thesis-dinner").

Voice examples (match this style):
- "An SPC dinner with other top-ranked SPC members to pressure-test 2-3 AI product theses"
- "A W09/S11 YC founder dinner for warm intros to AI-focused seed funds"
- "An HN Tokenmaxxing leaderboard meetup for build-in-public AI dev-tools founders"
- "A Dropbox alumni happy hour to recruit a founding engineer"

Also write "summary": 2-3 second-person sentences about the kinds of Festival events that would be most valuable to this person.

Return ONLY a single JSON object (no prose, no markdown fences) matching:
{"summary": string, "items": [{"id": string, "text": string, "category": "fundraising"|"hiring"|"intros"|"tactical"|"positioning"|"wellbeing"}]}`;
}

// Generate event recommendations from already-stored facts. Returns the parsed
// object plus the gateway-reported (or estimated) USD cost. Throws if the model
// output can't be parsed/validated after 2 attempts.
export async function generateEventRecommendations(
  input: {
    fullName: string | null;
    summary: string | null;
    priorities: Array<{ text: string; category: string }>;
  },
  model: EventRecModel = "sonnet",
): Promise<{ recs: EventRecommendations; costUsd: number }> {
  const prompt = buildPrompt(input);
  let lastErr = "";
  let costUsd = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const gen = await generateText({
      model: MODEL_ID[model],
      temperature: 0.5,
      maxOutputTokens: 2000,
      prompt,
    });
    const gw = (gen.providerMetadata?.gateway ?? {}) as { cost?: unknown };
    const c = typeof gw.cost === "string" ? Number(gw.cost) : typeof gw.cost === "number" ? gw.cost : NaN;
    if (Number.isFinite(c)) costUsd = c;
    try {
      const parsed = EventRecSchema.safeParse(extractJsonObject(gen.text));
      if (parsed.success) {
        return { recs: parsed.data, costUsd };
      }
      lastErr = `schema mismatch (${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join(", ")})`;
    } catch (e) {
      lastErr = (e as Error)?.message ?? String(e);
    }
  }
  throw new Error(`event-recs unparseable after 2 attempts: ${lastErr.slice(0, 160)}`);
}

// Read an eval's stored recommendations, reframe them as events, and write the
// result back to evaluations.recommendations. Skips rows with no existing
// recommendations (nothing to reframe). Returns a small result summary.
//
// NOTE: regenerated items get fresh slug ids; any existing recommendationResponses
// (owner 1-4 ratings) keyed on the old item ids are orphaned. Fine for the
// top-100 pilot (those profiles are unclaimed/unrated), but worth knowing.
export async function regenerateEventRecsForEval(
  evalId: string,
  model: EventRecModel = "sonnet",
): Promise<{ updated: boolean; itemCount: number; costUsd: number; skippedReason?: string }> {
  const [row] = await db
    .select({
      fullName: evaluations.fullName,
      recommendations: evaluations.recommendations,
    })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);

  if (!row) return { updated: false, itemCount: 0, costUsd: 0, skippedReason: "eval not found" };

  const stored = (row.recommendations ?? null) as StoredRecs | null;
  const priorities = (stored?.items ?? [])
    .filter((it) => typeof it.text === "string" && it.text.trim().length > 0)
    .map((it) => ({ text: it.text as string, category: (it.category as string) || "tactical" }));

  if (priorities.length === 0) {
    return { updated: false, itemCount: 0, costUsd: 0, skippedReason: "no existing recommendations to reframe" };
  }

  const { recs, costUsd } = await generateEventRecommendations(
    { fullName: row.fullName, summary: stored?.summary ?? null, priorities },
    model,
  );

  // Match the stored column shape exactly: { id, text, category } (drop the
  // confidence field the schema doesn't carry).
  await db
    .update(evaluations)
    .set({
      recommendations: {
        summary: recs.summary,
        items: recs.items.map((i) => ({ id: i.id, text: i.text, category: i.category })),
      },
    })
    .where(eq(evaluations.id, evalId));

  return { updated: true, itemCount: recs.items.length, costUsd };
}

// ---------------------------------------------------------------------------
// Rating-preserving reframe (recovery for orphaned owner ratings).
//
// The original reframe (above) minted fresh slug ids, orphaning any existing
// recommendationResponses (the owner's 1-4 Unlikely..Definitely ratings) that were
// keyed on the OLD priority ids — so those answers render as "(untitled)".
//
// This pass recovers the original priority text from the immutable
// scoring_runs.snapshot.recommendations (captured at score time, before the
// reframe), turns EACH rated priority into a single best-fit event proxy, and —
// crucially — REUSES the original priority's item id. Because the ratings are
// keyed by item id, they re-attach automatically; recommendationResponses is
// never touched.
// ---------------------------------------------------------------------------

type RecItem = { id: string; text: string; category: string };

// One event per priority, SAME order. We force the original id/category back on
// the result by position (never trust the model to echo ids), so a rating keyed
// on that id always re-attaches.
const Reframe1to1Schema = z.object({
  items: z.array(z.object({ text: z.string().min(1) })).min(1),
});

async function reframeEachPriorityToEvent(
  input: { fullName: string | null; summary: string | null; priorities: RecItem[] },
  model: EventRecModel = "sonnet",
): Promise<{ items: RecItem[]; costUsd: number }> {
  const lines = input.priorities.map((p, i) => `${i + 1}. [${p.category}] ${p.text}`).join("\n");
  const prompt = `You design IRL events for "Founder Festival", an invite-only community of top founders and investors. Members get invited to small, high-signal in-real-life gatherings (dinners, office hours, roundtables, happy hours, networking nights).

Below is a member's profile summary and a NUMBERED list of their priorities. Convert EACH priority into exactly ONE concrete Festival event this person would want to attend — the single most reasonable event proxy for that priority. Return the events in the SAME ORDER and the SAME COUNT as the input (one event per numbered priority, no merging, no extras).

Member: ${input.fullName ?? "(name unknown)"}
What they likely need right now: ${input.summary ?? "(no summary)"}
Priorities (convert each 1:1):
${lines}

Rules for each event:
- Phrase it as a concrete gathering they could attend. Start with "A" or "An" (e.g. "An SPC dinner…", "A YC W09/S11 founder dinner…").
- KEEP the specific hooks from that priority — named YC batches, communities (e.g. "SPC"), rankings, companies, alumni networks. Specificity is the entire point; never make it generic.
- One sentence, no trailing period needed.

Return ONLY a single JSON object (no prose, no markdown fences) with EXACTLY ${input.priorities.length} items in order:
{"items": [{"text": string}, ...]}`;

  let lastErr = "";
  let costUsd = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const gen = await generateText({ model: MODEL_ID[model], temperature: 0.4, maxOutputTokens: 2000, prompt });
    const gw = (gen.providerMetadata?.gateway ?? {}) as { cost?: unknown };
    const c = typeof gw.cost === "string" ? Number(gw.cost) : typeof gw.cost === "number" ? gw.cost : NaN;
    if (Number.isFinite(c)) costUsd = c;
    const parsed = Reframe1to1Schema.safeParse(extractJsonObject(gen.text));
    if (parsed.success && parsed.data.items.length === input.priorities.length) {
      // Force the original id + category back on by position — that's what makes
      // the owner's existing rating re-attach.
      const items = parsed.data.items.map((it, i) => ({
        id: input.priorities[i].id,
        text: it.text.trim(),
        category: input.priorities[i].category,
      }));
      return { items, costUsd };
    }
    lastErr = parsed.success
      ? `count mismatch (got ${parsed.data.items.length}, want ${input.priorities.length})`
      : `schema mismatch`;
  }
  throw new Error(`1:1 reframe unparseable after 2 attempts: ${lastErr.slice(0, 120)}`);
}

// Recover original priorities (id → {text, category}) for an eval from its
// immutable scoring_runs snapshots. Newest-first so a later snapshot wins ties,
// but in practice each id is unique. Only snapshots predating the reframe carry
// the priorities; that's exactly what we want.
async function recoverPrioritiesFromSnapshots(evalId: string): Promise<Map<string, RecItem>> {
  const runs = await db
    .select({ snapshot: scoringRuns.snapshot })
    .from(scoringRuns)
    .where(eq(scoringRuns.evaluationId, evalId))
    .orderBy(desc(scoringRuns.createdAt));
  const map = new Map<string, RecItem>();
  for (const r of runs) {
    const recs = (r.snapshot as { recommendations?: StoredRecs | null } | null)?.recommendations ?? null;
    for (const it of recs?.items ?? []) {
      if (it?.id && typeof it.text === "string" && it.text.trim() && !map.has(it.id)) {
        map.set(it.id, { id: it.id, text: it.text.trim(), category: (it.category as string) || "tactical" });
      }
    }
  }
  return map;
}

export type OrphanInspection = {
  found: boolean;
  fullName: string | null;
  summary: string | null;
  currentItems: RecItem[];
  orphanIds: string[]; // rated ids missing from the current items
  recoverable: RecItem[]; // orphaned ids we found original priority text for
  unrecoverable: string[]; // orphaned ids with no snapshot text (truly lost)
};

// Read-only: what would the rating-preserving reframe do for this eval? Powers
// the migration's dry-run (no LLM, no writes) and the executor below.
export async function inspectOrphanedRatings(evalId: string): Promise<OrphanInspection> {
  const [row] = await db
    .select({ fullName: evaluations.fullName, recommendations: evaluations.recommendations })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);
  if (!row) return { found: false, fullName: null, summary: null, currentItems: [], orphanIds: [], recoverable: [], unrecoverable: [] };

  const current = (row.recommendations ?? null) as StoredRecs | null;
  const currentItems = (current?.items ?? []).filter((it) => it?.id) as RecItem[];
  const currentIds = new Set(currentItems.map((it) => it.id));

  const responses = await db
    .select({ itemId: recommendationResponses.itemId })
    .from(recommendationResponses)
    .where(eq(recommendationResponses.evaluationId, evalId));
  const orphanIds = [...new Set(responses.map((r) => r.itemId))].filter((id) => !currentIds.has(id));

  const recoverMap = orphanIds.length > 0 ? await recoverPrioritiesFromSnapshots(evalId) : new Map<string, RecItem>();
  const recoverable = orphanIds.map((id) => recoverMap.get(id)).filter((p): p is RecItem => !!p);
  const unrecoverable = orphanIds.filter((id) => !recoverMap.has(id));

  return { found: true, fullName: row.fullName, summary: current?.summary ?? null, currentItems, orphanIds, recoverable, unrecoverable };
}

export type PreserveResult = {
  updated: boolean;
  recovered: number; // orphaned rated ids we found original priority text for
  unrecoverable: string[]; // orphaned rated ids with no snapshot text (truly lost)
  itemCount: number;
  costUsd: number;
  skippedReason?: string;
};

// Re-run the reframe for ONE eval in a way that preserves the owner's existing
// ratings: recover each orphaned-but-rated priority from snapshots, reframe it
// 1:1 into an event proxy reusing the original id, and merge those into the
// current items. Skips evals with no orphaned ratings (nothing to fix).
export async function regenerateEventRecsPreservingRatings(
  evalId: string,
  model: EventRecModel = "sonnet",
): Promise<PreserveResult> {
  const ins = await inspectOrphanedRatings(evalId);
  if (!ins.found) return { updated: false, recovered: 0, unrecoverable: [], itemCount: 0, costUsd: 0, skippedReason: "eval not found" };
  if (ins.orphanIds.length === 0) {
    return { updated: false, recovered: 0, unrecoverable: [], itemCount: ins.currentItems.length, costUsd: 0, skippedReason: "no orphaned ratings" };
  }
  if (ins.recoverable.length === 0) {
    return { updated: false, recovered: 0, unrecoverable: ins.unrecoverable, itemCount: ins.currentItems.length, costUsd: 0, skippedReason: "orphaned ids not found in any snapshot" };
  }

  const { items: reframed, costUsd } = await reframeEachPriorityToEvent(
    { fullName: ins.fullName, summary: ins.summary, priorities: ins.recoverable },
    model,
  );
  const currentItems = ins.currentItems;
  const unrecoverable = ins.unrecoverable;
  const current = { summary: ins.summary };

  // Merge: keep all current events, then append the recovered rated events
  // (reframed, keyed on their original ids). Dedup by id — the reframed ids are
  // the orphaned ones, which by definition aren't in currentIds.
  const byId = new Map<string, RecItem>();
  for (const it of [...currentItems, ...reframed]) byId.set(it.id, it);
  const items = [...byId.values()];

  await db
    .update(evaluations)
    .set({ recommendations: { summary: current?.summary ?? "", items } })
    .where(eq(evaluations.id, evalId));

  return { updated: true, recovered: reframed.length, unrecoverable, itemCount: items.length, costUsd };
}

// ---------------------------------------------------------------------------
// Remap ALREADY-orphaned ratings onto the current items.
//
// When recommendations were regenerated (re-score or an earlier reframe) the
// owner's recommendation_responses ended up keyed on item ids that no longer
// exist, so their ratings rendered on phantom "custom" rows. This pass asks the
// model to map each orphaned rating to the single current item it corresponds
// to (the regenerated events are near-identical, just re-slugged), then
// re-points the response's item_id so the rating re-attaches to the right row.
// Forward-looking orphaning is prevented separately (reEvaluate now preserves
// rated recommendations); this cleans up the existing backlog.
// ---------------------------------------------------------------------------

const RemapSchema = z.object({
  mappings: z.array(z.object({ oldId: z.string(), newId: z.string().nullable() })),
});

export type RemapResult = {
  remapped: number;
  unmapped: string[]; // orphaned ids the model found no current match for
  collisions: string[]; // target current item already had a rating (left alone)
  costUsd: number;
  skippedReason?: string;
};

export async function remapOrphanedRatings(evalId: string, model: EventRecModel = "sonnet"): Promise<RemapResult> {
  const [row] = await db
    .select({ fullName: evaluations.fullName, recommendations: evaluations.recommendations })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);
  if (!row) return { remapped: 0, unmapped: [], collisions: [], costUsd: 0, skippedReason: "eval not found" };

  const current = (row.recommendations ?? null) as StoredRecs | null;
  const items = (current?.items ?? []).filter((it) => it?.id) as RecItem[];
  const itemIds = new Set(items.map((i) => i.id));
  if (items.length === 0) return { remapped: 0, unmapped: [], collisions: [], costUsd: 0, skippedReason: "no current items to map onto" };

  const responses = await db
    .select({ itemId: recommendationResponses.itemId, category: recommendationResponses.category })
    .from(recommendationResponses)
    .where(eq(recommendationResponses.evaluationId, evalId));
  const ratedCurrent = new Set(responses.filter((r) => itemIds.has(r.itemId)).map((r) => r.itemId));
  const orphans = responses.filter((r) => !itemIds.has(r.itemId));
  if (orphans.length === 0) return { remapped: 0, unmapped: [], collisions: [], costUsd: 0, skippedReason: "no orphaned ratings" };

  // Enrich each orphaned id with its original text from snapshots when we have
  // it; otherwise the slug itself carries enough signal for the match.
  const snap = await recoverPrioritiesFromSnapshots(evalId);
  const oldList = orphans.map((o) => ({ id: o.itemId, category: o.category ?? "", text: snap.get(o.itemId)?.text ?? "" }));

  const newLines = items.map((it, i) => `${i + 1}. id="${it.id}" [${it.category}] ${it.text}`).join("\n");
  const oldLines = oldList.map((o, i) => `${i + 1}. id="${o.id}"${o.category ? ` [${o.category}]` : ""}${o.text ? ` ${o.text}` : ""}`).join("\n");
  const prompt = `A member rated a list of proposed Festival events. The event list was later regenerated, so each rating is now keyed to an OLD id that no longer exists. Map each OLD rated event to the SINGLE current event that represents the same underlying gathering (same topic/community/intent — the wording was only lightly rephrased and re-slugged).

CURRENT events:
${newLines}

OLD rated events to map:
${oldLines}

Rules:
- Each OLD event maps to at most ONE current event id; each current id may be used at most once.
- If an OLD event has no clear counterpart in the current list, map it to null.
- Match on meaning (the slug + text), not position.

Return ONLY a single JSON object (no prose, no fences): {"mappings": [{"oldId": string, "newId": string | null}, ...]} with one entry per OLD event.`;

  let costUsd = 0;
  let parsed: { mappings: Array<{ oldId: string; newId: string | null }> } | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const gen = await generateText({ model: MODEL_ID[model], temperature: 0.1, maxOutputTokens: 1000, prompt });
    const gw = (gen.providerMetadata?.gateway ?? {}) as { cost?: unknown };
    const c = typeof gw.cost === "string" ? Number(gw.cost) : typeof gw.cost === "number" ? gw.cost : NaN;
    if (Number.isFinite(c)) costUsd = c;
    const res = RemapSchema.safeParse(extractJsonObject(gen.text));
    if (res.success) { parsed = res.data; break; }
    lastErr = "schema mismatch";
  }
  if (!parsed) throw new Error(`remap unparseable after 2 attempts: ${lastErr}`);

  const orphanIds = new Set(orphans.map((o) => o.itemId));
  const used = new Set<string>();
  const unmapped: string[] = [];
  const collisions: string[] = [];
  let remapped = 0;
  for (const m of parsed.mappings) {
    if (!orphanIds.has(m.oldId)) continue; // model hallucinated an id
    if (!m.newId || !itemIds.has(m.newId)) { unmapped.push(m.oldId); continue; }
    if (used.has(m.newId) || ratedCurrent.has(m.newId)) { collisions.push(m.oldId); continue; }
    // Re-point the rating (and any visibility row) onto the current item id.
    await db
      .update(recommendationResponses)
      .set({ itemId: m.newId, updatedAt: new Date() })
      .where(and(eq(recommendationResponses.evaluationId, evalId), eq(recommendationResponses.itemId, m.oldId)));
    await db
      .update(recommendationVisibility)
      .set({ itemId: m.newId })
      .where(and(eq(recommendationVisibility.evaluationId, evalId), eq(recommendationVisibility.itemId, m.oldId)));
    used.add(m.newId);
    remapped++;
  }
  // Orphans the model omitted entirely also count as unmapped.
  for (const o of orphans) if (!parsed.mappings.some((m) => m.oldId === o.itemId)) unmapped.push(o.itemId);

  return { remapped, unmapped, collisions, costUsd };
}
