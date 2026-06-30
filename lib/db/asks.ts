import { and, desc, eq } from "drizzle-orm";
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

// Data layer for the OHS asks → expertise-matching connector. Thin DB access:
// every function self-heals the asks schema first (the country-column P0 lesson —
// new tables/columns must be self-healed AND every read path must call the ensure
// fn), then runs the query. Authorization + privacy live in the server actions
// and the matcher; this module is purely reads/writes.

export type AskStatus = "open" | "matched" | "closed";
export type AskResponseStatus = "offered" | "accepted" | "declined";
export type AskProposes = "async" | "zoom" | "dinner" | "other";

export const ASK_PROPOSES: readonly AskProposes[] = ["async", "zoom", "dinner", "other"];

// --- Reads --------------------------------------------------------------------

// All OPEN asks, newest first — the board's default list.
export async function listOpenAsks(): Promise<AskRow[]> {
  await ensureAsksSchema();
  return getDb()
    .select()
    .from(asks)
    .where(eq(asks.status, "open"))
    .orderBy(desc(asks.createdAt));
}

// A single ask by id (any status), or null. Used by the detail page.
export async function getAskById(id: string): Promise<AskRow | null> {
  await ensureAsksSchema();
  const [row] = await getDb().select().from(asks).where(eq(asks.id, id)).limit(1);
  return row ?? null;
}

// Every response to an ask, oldest first (offer order). The detail page shows
// these to the asker (who can accept/decline) and lets a helper see their own.
export async function listResponsesForAsk(askId: string): Promise<AskResponseRow[]> {
  await ensureAsksSchema();
  return getDb()
    .select()
    .from(askResponses)
    .where(eq(askResponses.askId, askId))
    .orderBy(askResponses.createdAt);
}

// How many asks this author has created since `sinceMs` (epoch). Backs the
// per-author rate limit in the create-ask server action.
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

// Whether this responder already offered on this ask (one offer per helper per
// ask — enforced in the respond action so a helper can't spam a single ask).
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

// The DB↔matcher adapter: load candidate helper profiles and rank them by
// expertise overlap with the ask. We pull every VERIFIED, NON-student family
// signup (the matcher needs their raw expertise signals), project each into a
// HelperCandidate, and defer ALL ranking to the pure rankCandidates(). The asker
// + students are excluded inside the matcher too (belt and suspenders).
//
// Privacy: `token` is set ONLY when the member passes isDirectoryVisible (the
// same single-source-of-truth gate the directory/`/p` uses), so a suggested card
// links to a profile ONLY if that member opted into sharing — never leaking a
// path to a private profile. Members who match on expertise but share nothing are
// still suggested (name only, no link) so the asker can see help exists, but no
// PII/contact is exposed. Verification is required so unverified families never
// surface as helpers.
export async function getSuggestedHelpers(
  ask: Pick<AskRow, "expertiseTags" | "authorSignupId">,
  limit = 8,
): Promise<AskMatch[]> {
  // No tags → no signal → no suggestions (matcher returns [] anyway; short-circuit).
  if (!ask.expertiseTags || ask.expertiseTags.length === 0) return [];

  await ensureFamiliesSchema();
  const rows = await getDb().select().from(signups);

  const candidates: HelperCandidate[] = rows
    .filter((r) => isFamilyVerified(r)) // unverified families never help
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
  title: string;
  body: string;
  expertiseTags: string[];
}): Promise<AskRow> {
  await ensureAsksSchema();
  const [row] = await getDb()
    .insert(asks)
    .values({
      authorSignupId: input.authorSignupId,
      authorClerkId: input.authorClerkId,
      title: input.title,
      body: input.body,
      expertiseTags: input.expertiseTags,
    })
    .returning();
  return row;
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

// Record the asker's decision on a response, scoped so it ONLY applies to a
// response whose parent ask the caller authored (authorSignupId). The join-in-
// WHERE is the authorization: a response on someone else's ask matches 0 rows and
// is a silent no-op. On ACCEPT we also flip the ask to 'matched'. Returns the
// updated response, or null if nothing matched (not the asker / unknown id).
export async function decideResponse(input: {
  responseId: string;
  askerSignupId: string;
  decision: "accepted" | "declined";
}): Promise<AskResponseRow | null> {
  await ensureAsksSchema();
  const db = getDb();

  // Confirm the response belongs to an ask authored by the caller before writing.
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
