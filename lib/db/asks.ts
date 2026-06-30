import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ensureAsksSchema, ensureFamiliesSchema } from "@/lib/db/ensure";
import {
  asks,
  askResponses,
  type AskRow,
  type AskResponseRow,
} from "@/lib/db/schema/asks";
import { signups } from "@/lib/db/schema/signups";
import { isStudentAccount } from "@/lib/family-display";
import {
  expertiseSignalsOf,
  isDirectoryVisible,
  isFamilyVerified,
} from "@/lib/directory";
import { rankCandidates, type AskMatch, type HelperCandidate } from "@/lib/ask-matching";

// Data layer for the OHS "Exchange" connector (evolved from the one-directional
// "Asks" board). Thin DB access: every function self-heals the asks schema first
// (the country-column P0 lesson — new tables/columns must be self-healed AND
// every read path must call the ensure fn), then runs the query. Authorization +
// privacy live in the server actions and the matcher; this module is purely
// reads/writes. The TABLE stays named `asks`; a `kind` column splits ask/offer.

// 'open' (active) | 'matched' (a response was accepted) | 'resolved' (author
// marked it done) | 'closed' (withdrawn).
export type AskStatus = "open" | "matched" | "resolved" | "closed";
export type AskResponseStatus = "offered" | "accepted" | "declined";
export type AskProposes = "async" | "zoom" | "dinner" | "other";
export type AskKind = "ask" | "offer";
export type AskUrgency = "low" | "normal" | "high";

export const ASK_PROPOSES: readonly AskProposes[] = ["async", "zoom", "dinner", "other"];
export const ASK_KINDS: readonly AskKind[] = ["ask", "offer"];
export const ASK_URGENCIES: readonly AskUrgency[] = ["low", "normal", "high"];

// --- Reads --------------------------------------------------------------------

// All OPEN posts, oldest first — the board's DEFAULT list (oldest pending on top
// so the longest-waiting post gets attention first). Other sorts/filters are
// applied client-side from this set.
export async function listOpenAsks(): Promise<AskRow[]> {
  await ensureAsksSchema();
  return getDb()
    .select()
    .from(asks)
    .where(eq(asks.status, "open"))
    .orderBy(asc(asks.createdAt));
}

// All posts regardless of status (open + resolved + matched), oldest open first
// for the board. Used when the viewer asks to see resolved posts too. We fetch
// broadly and let the client toggle status; ordering here is created_at ASC so
// the default "oldest open first" holds once the client filters to open.
export async function listAllAsks(): Promise<AskRow[]> {
  await ensureAsksSchema();
  return getDb()
    .select()
    .from(asks)
    .where(ne(asks.status, "closed"))
    .orderBy(asc(asks.createdAt));
}

// A single post by id (any status), or null. Used by the detail page.
export async function getAskById(id: string): Promise<AskRow | null> {
  await ensureAsksSchema();
  const [row] = await getDb().select().from(asks).where(eq(asks.id, id)).limit(1);
  return row ?? null;
}

// Every response to a post, oldest first (offer/request order). The detail page
// shows these to the author (who can accept/decline) and lets a responder see
// their own.
export async function listResponsesForAsk(askId: string): Promise<AskResponseRow[]> {
  await ensureAsksSchema();
  return getDb()
    .select()
    .from(askResponses)
    .where(eq(askResponses.askId, askId))
    .orderBy(askResponses.createdAt);
}

// How many posts this author has created since `sinceMs` (epoch). Backs the
// per-author rate limit in the create action.
export async function countAsksByAuthorSince(
  authorSignupId: string,
  sinceMs: number,
): Promise<number> {
  await ensureAsksSchema();
  const rows = await getDb()
    .select({ id: asks.id, createdAt: asks.createdAt })
    .from(asks)
    .where(eq(asks.authorSignupId, authorSignupId));
  return rows.filter((r) => {
    const t = r.createdAt instanceof Date ? r.createdAt.getTime() : Date.parse(String(r.createdAt));
    return Number.isFinite(t) && t >= sinceMs;
  }).length;
}

// Whether this responder already responded to this post (one response per member
// per post — enforced in the respond action so a member can't spam a single post).
export async function hasResponded(
  askId: string,
  responderSignupId: string,
): Promise<boolean> {
  await ensureAsksSchema();
  const [row] = await getDb()
    .select({ id: askResponses.id })
    .from(askResponses)
    .where(
      and(
        eq(askResponses.askId, askId),
        eq(askResponses.responderSignupId, responderSignupId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// The DB↔matcher adapter: load candidate member profiles and rank them by
// expertise overlap with the post. We pull every VERIFIED family signup (the
// matcher needs their raw expertise signals), project each into a HelperCandidate,
// and defer ALL ranking to the pure rankCandidates(). The author is excluded
// inside the matcher too (belt and suspenders). For an Ask, these are people who
// could help; for an Offer, these are people who might be interested.
//
// Privacy: `token` is set ONLY when the member passes isDirectoryVisible (the
// same single-source-of-truth gate the directory/`/p` uses), so a suggested card
// links to a profile ONLY if that member opted into sharing — never leaking a
// path to a private profile. Members who match on expertise but share nothing are
// still suggested (name only, no link). Verification is required so unverified
// families never surface.
export async function getSuggestedHelpers(
  ask: Pick<AskRow, "expertiseTags" | "authorSignupId">,
  limit = 8,
): Promise<AskMatch[]> {
  // No tags → no signal → no suggestions (matcher returns [] anyway; short-circuit).
  if (!ask.expertiseTags || ask.expertiseTags.length === 0) return [];

  await ensureFamiliesSchema();
  const rows = await getDb().select().from(signups);

  const candidates: HelperCandidate[] = rows
    .filter((r) => isFamilyVerified(r)) // unverified families never surface
    .map((r) => {
      const signals = expertiseSignalsOf(r);
      return {
        signupId: r.id,
        // Link ONLY when the member is directory-visible (opted into sharing).
        token: isDirectoryVisible(r) ? r.shareToken : null,
        name: isStudentAccount(r)
          ? r.firstName
          : [r.firstName, r.lastName].filter(Boolean).join(" "),
        isStudent: isStudentAccount(r),
        expertiseSignals: signals,
        signalCount: signals.length,
      } satisfies HelperCandidate;
    });

  return rankCandidates({
    askTags: ask.expertiseTags,
    candidates,
    excludeSignupId: ask.authorSignupId,
    limit,
  });
}

// A single response by id, or null. Used by the decide action to load + scope.
export async function getResponseById(id: string): Promise<AskResponseRow | null> {
  await ensureAsksSchema();
  const [row] = await getDb()
    .select()
    .from(askResponses)
    .where(eq(askResponses.id, id))
    .limit(1);
  return row ?? null;
}

// --- Writes -------------------------------------------------------------------

export async function createAsk(input: {
  authorSignupId: string;
  authorClerkId: string | null;
  kind: AskKind;
  title: string;
  body: string;
  expertiseTags: string[];
  urgency: AskUrgency;
  validUntil: Date | null;
}): Promise<AskRow> {
  await ensureAsksSchema();
  const [row] = await getDb()
    .insert(asks)
    .values({
      authorSignupId: input.authorSignupId,
      authorClerkId: input.authorClerkId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      expertiseTags: input.expertiseTags,
      urgency: input.urgency,
      validUntil: input.validUntil,
    })
    .returning();
  return row;
}

// Update a post's editable fields — scoped to the author (the WHERE clause is the
// authorization: a post owned by someone else matches 0 rows → null no-op).
export async function updateAsk(input: {
  id: string;
  authorSignupId: string;
  kind: AskKind;
  title: string;
  body: string;
  expertiseTags: string[];
  urgency: AskUrgency;
  validUntil: Date | null;
}): Promise<AskRow | null> {
  await ensureAsksSchema();
  const [row] = await getDb()
    .update(asks)
    .set({
      kind: input.kind,
      title: input.title,
      body: input.body,
      expertiseTags: input.expertiseTags,
      urgency: input.urgency,
      validUntil: input.validUntil,
      updatedAt: new Date(),
    })
    .where(and(eq(asks.id, input.id), eq(asks.authorSignupId, input.authorSignupId)))
    .returning();
  return row ?? null;
}

// Delete a post — scoped to the author. Returns true if a row was deleted (the
// caller was the author), false otherwise. Cascades to ask_responses (FK).
export async function deleteAsk(input: {
  id: string;
  authorSignupId: string;
}): Promise<boolean> {
  await ensureAsksSchema();
  const deleted = await getDb()
    .delete(asks)
    .where(and(eq(asks.id, input.id), eq(asks.authorSignupId, input.authorSignupId)))
    .returning({ id: asks.id });
  return deleted.length > 0;
}

// Toggle a post between open and resolved — scoped to the author. On resolve we
// set status='resolved' + resolved_at; on reopen we clear back to open + null
// resolved_at. Returns the updated row, or null (not the author / unknown id).
export async function setAskResolved(input: {
  id: string;
  authorSignupId: string;
  resolved: boolean;
}): Promise<AskRow | null> {
  await ensureAsksSchema();
  const [row] = await getDb()
    .update(asks)
    .set({
      status: input.resolved ? "resolved" : "open",
      resolvedAt: input.resolved ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(asks.id, input.id), eq(asks.authorSignupId, input.authorSignupId)))
    .returning();
  return row ?? null;
}

export async function createResponse(input: {
  askId: string;
  responderSignupId: string;
  responderClerkId: string | null;
  offer: string;
  proposes: AskProposes;
}): Promise<AskResponseRow> {
  await ensureAsksSchema();
  const [row] = await getDb()
    .insert(askResponses)
    .values({
      askId: input.askId,
      responderSignupId: input.responderSignupId,
      responderClerkId: input.responderClerkId,
      offer: input.offer,
      proposes: input.proposes,
    })
    .returning();
  return row;
}

// Record the author's decision on a response, scoped so it ONLY applies to a
// response whose parent post the caller authored (authorSignupId). The join-in-
// WHERE is the authorization: a response on someone else's post matches 0 rows
// and is a silent no-op. On ACCEPT we also flip the post to 'matched'. Returns the
// updated response, or null if nothing matched (not the author / unknown id).
export async function decideResponse(input: {
  responseId: string;
  askerSignupId: string;
  decision: "accepted" | "declined";
}): Promise<AskResponseRow | null> {
  await ensureAsksSchema();
  const db = getDb();

  // Confirm the response belongs to a post authored by the caller before writing.
  const [match] = await db
    .select({ responseId: askResponses.id, askId: asks.id })
    .from(askResponses)
    .innerJoin(asks, eq(askResponses.askId, asks.id))
    .where(
      and(
        eq(askResponses.id, input.responseId),
        eq(asks.authorSignupId, input.askerSignupId),
      ),
    )
    .limit(1);
  if (!match) return null;

  const [updated] = await db
    .update(askResponses)
    .set({ status: input.decision, decidedAt: new Date() })
    .where(eq(askResponses.id, input.responseId))
    .returning();

  if (input.decision === "accepted") {
    await db
      .update(asks)
      .set({ status: "matched", updatedAt: new Date() })
      .where(eq(asks.id, match.askId));
  }

  return updated ?? null;
}
