import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { getSql, getDb, hasDatabase } from "@/lib/db";

// Data layer for the Community board's ENGAGEMENT enhancements (upvote / attach /
// scheduling). Deliberately self-contained: like lib/admin.ts (ensureAdminsTable)
// and lib/db/notifications.ts (ensureNotificationsTable), this module owns its
// OWN idempotent self-heal DDL rather than touching the shared lib/db/ensure.ts
// or the canonical `asks` schema. The app shares one Neon DB across in-flight
// features and a sibling `drizzle-kit push` could drop tables it doesn't know
// about, so we create these tables on first use per cold start, and EVERY read/
// write calls the ensure fn first (the country-column P0 lesson: new tables must
// be self-healed AND every access path must guard with the ensure fn).
//
// PRIVACY: nothing here stores PII. Upvotes/attachments key off a signups.id
// (the same id the board already authorizes on); the optional `ea_email` on a
// schedule is a *parent-supplied* assistant address that only ever rides along
// as a CC on the intro email the two connected adults already consented to — it
// is never displayed on the board and never tied to a student.

// --- Drizzle table handles (mirror the self-heal DDL below) ------------------

export const askUpvotes = pgTable("ask_upvotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  askId: uuid("ask_id").notNull(),
  voterSignupId: uuid("voter_signup_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const askAttachments = pgTable("ask_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  askId: uuid("ask_id").notNull(),
  memberSignupId: uuid("member_signup_id").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// One proposed date/time option attached to a response (the helper/requester can
// propose 1-3 slots). `startsAt` is the proposed instant (UTC).
export const responseSlots = pgTable("community_response_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  responseId: uuid("response_id").notNull(),
  askId: uuid("ask_id").notNull(),
  proposerSignupId: uuid("proposer_signup_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Per-response scheduling metadata. Keyed 1:1 on response_id. `eaEmail` is the
// optional executive-assistant address to CC on the intro email; never rendered.
export const responseMeta = pgTable("community_response_meta", {
  responseId: uuid("response_id").primaryKey(),
  eaEmail: text("ea_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AskUpvoteRow = typeof askUpvotes.$inferSelect;
export type AskAttachmentRow = typeof askAttachments.$inferSelect;
export type ResponseSlotRow = typeof responseSlots.$inferSelect;
export type ResponseMetaRow = typeof responseMeta.$inferSelect;

// --- Self-heal DDL -----------------------------------------------------------

let ensured: Promise<void> | null = null;
export function ensureCommunityEngageSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sqlClient = getSql();
      // Upvotes: one row per (ask, voter) — the UNIQUE constraint is the
      // one-vote-per-member rule, enforced at the DB so a double-submit can't
      // double-count.
      await sqlClient`
        CREATE TABLE IF NOT EXISTS ask_upvotes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          ask_id uuid NOT NULL,
          voter_signup_id uuid NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (ask_id, voter_signup_id)
        )
      `;
      await sqlClient`
        CREATE INDEX IF NOT EXISTS ask_upvotes_ask_idx ON ask_upvotes (ask_id)
      `;
      // Attachments ("I'd join this too"): one row per (ask, member).
      await sqlClient`
        CREATE TABLE IF NOT EXISTS ask_attachments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          ask_id uuid NOT NULL,
          member_signup_id uuid NOT NULL,
          note text,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (ask_id, member_signup_id)
        )
      `;
      await sqlClient`
        CREATE INDEX IF NOT EXISTS ask_attachments_ask_idx ON ask_attachments (ask_id)
      `;
      // Proposed scheduling slots, attached to a response.
      await sqlClient`
        CREATE TABLE IF NOT EXISTS community_response_slots (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          response_id uuid NOT NULL,
          ask_id uuid NOT NULL,
          proposer_signup_id uuid NOT NULL,
          starts_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sqlClient`
        CREATE INDEX IF NOT EXISTS community_response_slots_response_idx
          ON community_response_slots (response_id)
      `;
      // Per-response scheduling metadata (EA email).
      await sqlClient`
        CREATE TABLE IF NOT EXISTS community_response_meta (
          response_id uuid PRIMARY KEY,
          ea_email text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

// --- Upvotes -----------------------------------------------------------------

// Toggle the caller's upvote on a post. Idempotent + symmetric: if a row exists
// it's removed (un-vote), else inserted (vote). The UNIQUE (ask_id, voter) keeps
// it one-per-member even under a double-submit. Returns the post's new state.
export async function toggleUpvote(input: {
  askId: string;
  voterSignupId: string;
}): Promise<{ upvoted: boolean; count: number }> {
  await ensureCommunityEngageSchema();
  const db = getDb();
  const existing = await db
    .select({ id: askUpvotes.id })
    .from(askUpvotes)
    .where(
      and(eq(askUpvotes.askId, input.askId), eq(askUpvotes.voterSignupId, input.voterSignupId)),
    )
    .limit(1);

  let upvoted: boolean;
  if (existing.length > 0) {
    await db
      .delete(askUpvotes)
      .where(
        and(eq(askUpvotes.askId, input.askId), eq(askUpvotes.voterSignupId, input.voterSignupId)),
      );
    upvoted = false;
  } else {
    // ON CONFLICT DO NOTHING so a racing double-vote is a silent no-op, not a throw.
    await db
      .insert(askUpvotes)
      .values({ askId: input.askId, voterSignupId: input.voterSignupId })
      .onConflictDoNothing();
    upvoted = true;
  }
  const count = await countUpvotes(input.askId);
  return { upvoted, count };
}

export async function countUpvotes(askId: string): Promise<number> {
  await ensureCommunityEngageSchema();
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(askUpvotes)
    .where(eq(askUpvotes.askId, askId));
  return row?.n ?? 0;
}

export async function hasUpvoted(askId: string, voterSignupId: string): Promise<boolean> {
  await ensureCommunityEngageSchema();
  const [row] = await getDb()
    .select({ id: askUpvotes.id })
    .from(askUpvotes)
    .where(and(eq(askUpvotes.askId, askId), eq(askUpvotes.voterSignupId, voterSignupId)))
    .limit(1);
  return Boolean(row);
}

// --- Attach / join ("I'd join this too") -------------------------------------

// Toggle the caller's attachment to a post. Same symmetric toggle as upvote, but
// carries an optional short note saved only on (re)attach. Returns new state.
export async function toggleAttach(input: {
  askId: string;
  memberSignupId: string;
  note: string | null;
}): Promise<{ attached: boolean; count: number }> {
  await ensureCommunityEngageSchema();
  const db = getDb();
  const existing = await db
    .select({ id: askAttachments.id })
    .from(askAttachments)
    .where(
      and(
        eq(askAttachments.askId, input.askId),
        eq(askAttachments.memberSignupId, input.memberSignupId),
      ),
    )
    .limit(1);

  let attached: boolean;
  if (existing.length > 0) {
    await db
      .delete(askAttachments)
      .where(
        and(
          eq(askAttachments.askId, input.askId),
          eq(askAttachments.memberSignupId, input.memberSignupId),
        ),
      );
    attached = false;
  } else {
    await db
      .insert(askAttachments)
      .values({
        askId: input.askId,
        memberSignupId: input.memberSignupId,
        note: input.note,
      })
      .onConflictDoNothing();
    attached = true;
  }
  const count = await countAttachments(input.askId);
  return { attached, count };
}

export async function countAttachments(askId: string): Promise<number> {
  await ensureCommunityEngageSchema();
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(askAttachments)
    .where(eq(askAttachments.askId, askId));
  return row?.n ?? 0;
}

export async function hasAttached(askId: string, memberSignupId: string): Promise<boolean> {
  await ensureCommunityEngageSchema();
  const [row] = await getDb()
    .select({ id: askAttachments.id })
    .from(askAttachments)
    .where(
      and(eq(askAttachments.askId, askId), eq(askAttachments.memberSignupId, memberSignupId)),
    )
    .limit(1);
  return Boolean(row);
}

// The member signup ids attached to a post (for resolving display cards). Order
// by created_at so the longest-standing joiners show first.
export async function listAttachmentMemberIds(askId: string): Promise<string[]> {
  await ensureCommunityEngageSchema();
  const rows = await getDb()
    .select({ memberSignupId: askAttachments.memberSignupId })
    .from(askAttachments)
    .where(eq(askAttachments.askId, askId))
    .orderBy(asc(askAttachments.createdAt));
  return rows.map((r) => r.memberSignupId);
}

// Bulk upvote + attachment counts for a set of posts — backs the board list
// without an N+1. Returns Maps keyed by ask id (absent → 0).
export async function engagementCountsFor(
  askIds: string[],
): Promise<{ upvotes: Map<string, number>; attachments: Map<string, number> }> {
  const upvotes = new Map<string, number>();
  const attachments = new Map<string, number>();
  if (askIds.length === 0 || !hasDatabase()) return { upvotes, attachments };
  await ensureCommunityEngageSchema();
  const db = getDb();
  const [upRows, atRows] = await Promise.all([
    db
      .select({ askId: askUpvotes.askId, n: sql<number>`count(*)::int` })
      .from(askUpvotes)
      .where(inArray(askUpvotes.askId, askIds))
      .groupBy(askUpvotes.askId),
    db
      .select({ askId: askAttachments.askId, n: sql<number>`count(*)::int` })
      .from(askAttachments)
      .where(inArray(askAttachments.askId, askIds))
      .groupBy(askAttachments.askId),
  ]);
  for (const r of upRows) upvotes.set(r.askId, r.n);
  for (const r of atRows) attachments.set(r.askId, r.n);
  return { upvotes, attachments };
}

// The set of ask ids THIS member has upvoted / attached, among a candidate set —
// so the board can render the caller's own toggled state without an N+1.
export async function myEngagementState(
  signupId: string,
  askIds: string[],
): Promise<{ upvoted: Set<string>; attached: Set<string> }> {
  const upvoted = new Set<string>();
  const attached = new Set<string>();
  if (askIds.length === 0 || !signupId || !hasDatabase()) return { upvoted, attached };
  await ensureCommunityEngageSchema();
  const db = getDb();
  const [upRows, atRows] = await Promise.all([
    db
      .select({ askId: askUpvotes.askId })
      .from(askUpvotes)
      .where(and(eq(askUpvotes.voterSignupId, signupId), inArray(askUpvotes.askId, askIds))),
    db
      .select({ askId: askAttachments.askId })
      .from(askAttachments)
      .where(
        and(eq(askAttachments.memberSignupId, signupId), inArray(askAttachments.askId, askIds)),
      ),
  ]);
  for (const r of upRows) upvoted.add(r.askId);
  for (const r of atRows) attached.add(r.askId);
  return { upvoted, attached };
}

// --- Scheduling slots + EA email ---------------------------------------------

// Persist the proposed slots + optional EA email for a response. Slots are stored
// fresh (deleted-then-inserted) so an edit replaces cleanly. Pass already-validated
// Date instants (lib/community-schedule validates + caps to 1-3).
export async function saveResponseSchedule(input: {
  responseId: string;
  askId: string;
  proposerSignupId: string;
  slots: Date[];
  eaEmail: string | null;
}): Promise<void> {
  await ensureCommunityEngageSchema();
  const db = getDb();
  await db.delete(responseSlots).where(eq(responseSlots.responseId, input.responseId));
  if (input.slots.length > 0) {
    await db.insert(responseSlots).values(
      input.slots.map((startsAt) => ({
        responseId: input.responseId,
        askId: input.askId,
        proposerSignupId: input.proposerSignupId,
        startsAt,
      })),
    );
  }
  // Upsert the meta row (EA email). Clearing the EA email writes NULL.
  await db
    .insert(responseMeta)
    .values({ responseId: input.responseId, eaEmail: input.eaEmail })
    .onConflictDoUpdate({
      target: responseMeta.responseId,
      set: { eaEmail: input.eaEmail },
    });
}

// The proposed slots for a response, soonest first.
export async function listResponseSlots(responseId: string): Promise<ResponseSlotRow[]> {
  await ensureCommunityEngageSchema();
  return getDb()
    .select()
    .from(responseSlots)
    .where(eq(responseSlots.responseId, responseId))
    .orderBy(asc(responseSlots.startsAt));
}

// The EA email for a response, or null. Used only by the intro-email CC path on
// accept — never surfaced in the UI.
export async function getResponseEaEmail(responseId: string): Promise<string | null> {
  await ensureCommunityEngageSchema();
  const [row] = await getDb()
    .select({ eaEmail: responseMeta.eaEmail })
    .from(responseMeta)
    .where(eq(responseMeta.responseId, responseId))
    .limit(1);
  return row?.eaEmail ?? null;
}

// Slots for many responses at once (board/detail render) — keyed by response id.
export async function slotsByResponse(
  responseIds: string[],
): Promise<Map<string, ResponseSlotRow[]>> {
  const out = new Map<string, ResponseSlotRow[]>();
  if (responseIds.length === 0 || !hasDatabase()) return out;
  await ensureCommunityEngageSchema();
  const rows = await getDb()
    .select()
    .from(responseSlots)
    .where(inArray(responseSlots.responseId, responseIds))
    .orderBy(asc(responseSlots.startsAt));
  for (const r of rows) {
    const list = out.get(r.responseId) ?? [];
    list.push(r);
    out.set(r.responseId, list);
  }
  return out;
}
