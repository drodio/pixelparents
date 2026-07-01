import { eq, desc, sql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { signups, children, type SignupRow, type ChildRow } from "@/lib/db/schema/signups";
import { ensureFamiliesSchema, ensureDirectoryIndex } from "@/lib/db/ensure";
import { OHS_AFFILIATIONS } from "@/lib/options";

// The two student affiliations from OHS_AFFILIATIONS — current students and
// alumni. Used to count "students building Pixel Parents". Sliced from the
// canonical list so the exact strings stay in lockstep with the signup form.
const STUDENT_AFFILIATIONS: readonly string[] = [
  OHS_AFFILIATIONS[3], // "Current OHS student (I'm currently enrolled at OHS)"
  OHS_AFFILIATIONS[4], // "Alumni student (I graduated from OHS)"
];

// Map a signed-in user's email to their most recent signup (for /account).
// Emails are stored as typed (not normalized), so match case-insensitively —
// matching the lowercasing convention used throughout lib/admin.ts.
export async function getSignupByEmail(email: string): Promise<SignupRow | null> {
  // Self-heal the signups schema before a SELECT * — the Drizzle schema includes
  // columns (e.g. country) that may not yet exist on a prod DB without a migration.
  await ensureFamiliesSchema();
  const [row] = await getDb()
    .select()
    .from(signups)
    .where(sql`lower(${signups.email}) = ${email.toLowerCase()}`)
    .orderBy(desc(signups.createdAt))
    .limit(1);
  return row ?? null;
}

// Update a single parent's LinkedIn profile URL, scoped to their own signup id.
// The account page's LinkedIn editor calls this via a server action that first
// re-derives the caller from the Clerk session and matches signup.email, so the
// signupId handed in here is always the caller's own row (authorization lives in
// the action, not this helper). `url` is a pre-validated canonical href or null
// (to clear the field). Returns false when no row matched.
export async function updateSignupLinkedin(
  signupId: string,
  url: string | null,
): Promise<boolean> {
  await ensureFamiliesSchema();
  const rows = await getDb()
    .update(signups)
    .set({ linkedinUrl: url })
    .where(eq(signups.id, signupId))
    .returning({ id: signups.id });
  return rows.length > 0;
}

// Rows the Directory page needs, with the CHEAP visibility preconditions pushed
// into SQL so a cold render reads a fraction of the table instead of every signup.
//
// The page still applies the authoritative isDirectoryVisible() gate in JS (so
// semantics are byte-for-byte identical) — this just feeds it far fewer rows. The
// WHERE clause returns the UNION of:
//   (a) directory CANDIDATES: share_enabled = true AND share_token IS NOT NULL AND
//       first_name <> '' — the index-friendly subset of isDirectoryVisible's
//       preconditions (the remaining checks — verification, share_visibility,
//       not-a-student — stay in JS); and
//   (b) every STUDENT account (extra.accountType = 'student'), regardless of its
//       own sharing — the page needs these to enrich a visible PARENT's card
//       (a child resolved to its linked student account). Student accounts are
//       few, so including them all keeps studentsByFamily complete without a
//       second round-trip, while (a) still drops the bulk of non-sharing parents.
//
// Ordered newest-first to match the page's prior `orderBy(desc(createdAt))`. The
// partial index (ensureDirectoryIndex) backs the (a) branch's ordered scan.
export async function getDirectorySignups(): Promise<SignupRow[]> {
  // Self-heal the signups schema before SELECT * (same rationale as the reads
  // below), and ensure the supporting partial index exists, both idempotent.
  await Promise.all([ensureFamiliesSchema(), ensureDirectoryIndex()]);
  return getDb()
    .select()
    .from(signups)
    .where(
      sql`(
        ${signups.shareEnabled} = true
        AND ${signups.shareToken} IS NOT NULL
        AND btrim(${signups.firstName}) <> ''
      ) OR ${signups.extra}->>'accountType' = 'student'`,
    )
    .orderBy(desc(signups.createdAt));
}

// The caller's family, resolved from their signed-in email. Returns the caller's
// own signup, EVERY signup in the same family (the caller + co-parents), and the
// family's shared children. Used by the /family hub. The family_id is the sharing
// key: any parent in the family may view + edit any member (authorized server-side
// by patchFamilyMember, which re-derives the caller from the session).
export type FamilyForEmail = {
  self: SignupRow;
  members: SignupRow[]; // all parents in the family (includes self), oldest first
  kids: ChildRow[];
};

export async function getFamilyForEmail(email: string): Promise<FamilyForEmail | null> {
  // Self-heal before any SELECT * — the recent P0 was a missing column on exactly
  // this kind of read; ensureFamiliesSchema() backfills family_id/country/etc.
  await ensureFamiliesSchema();
  // Resolve the caller's own signup (case-insensitive, most-recent-wins — same
  // rule as getSignupByEmail, so a user with multiple rows lands on the same one).
  const self = await getSignupByEmail(email);
  if (!self) return null;

  // All parents sharing this family_id (the caller + any co-parents), oldest first.
  const members = await getDb()
    .select()
    .from(signups)
    .where(eq(signups.familyId, self.familyId))
    .orderBy(signups.createdAt);

  // The family's shared children (every parent sees + edits the same kids).
  const kids = await getDb()
    .select()
    .from(children)
    .where(eq(children.familyId, self.familyId))
    .orderBy(children.createdAt);

  return { self, members, kids };
}

// The family_id for a signed-in email (most-recent signup wins). Used by the
// secure cross-account editor (patchFamilyMember) to scope an UPDATE to the
// caller's family. Returns null when the email has no signup. Self-heals first.
export async function familyIdForEmail(email: string): Promise<string | null> {
  await ensureFamiliesSchema();
  const [row] = await getDb()
    .select({ familyId: signups.familyId })
    .from(signups)
    .where(sql`lower(${signups.email}) = ${email.toLowerCase()}`)
    .orderBy(desc(signups.createdAt))
    .limit(1);
  return row?.familyId ?? null;
}

// The "this signup is finished" predicate. The signup flow inserts a DRAFT row
// on first interaction (empty firstName/email); completeSignup only stamps
// extra.notified=true once the required fields validate + the DROdio email
// fires. Social-proof counts must mirror THAT semantics — otherwise abandoned
// drafts, in-progress rows, and never-completed co-parent drafts inflate the
// headline numbers. Exported so the count queries below (and their test) share
// one source of truth for "completed". Matches completeSignup's marker in
// app/signup/actions.ts.
//
// NOTE: submitSignup (the no-JS fallback POST) inserts a fully-filled row but
// does NOT set extra.notified. That legacy path is currently unused by the live
// autosave UI; if it is ever re-enabled it must stamp notified=true on insert to
// be counted here — kept intentionally strict so the count means "completed".
export const COMPLETED_SIGNUP_SQL = sql`(${signups.extra}->>'notified') = 'true'`;

// Total number of parents who have COMPLETED signup. Used on /signup to show
// "Join N other Pixel Parents" as social proof — drafts are excluded.
export async function getSignupCount(): Promise<number> {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(signups)
    .where(COMPLETED_SIGNUP_SQL);
  return row?.c ?? 0;
}

// Total number of kids (children) registered across COMPLETED signups. Used on
// /signup ("Helping connect N OHS kids IRL"). A child belongs to a family, so
// count only children whose family has at least one completed parent — drafts
// that added a child but never finished don't inflate the number.
export async function getChildrenCount(): Promise<number> {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(children)
    .where(
      sql`EXISTS (
        SELECT 1 FROM ${signups}
        WHERE ${signups.familyId} = ${children.familyId}
          AND ${COMPLETED_SIGNUP_SQL}
      )`,
    );
  return row?.c ?? 0;
}

// NOTE: the "N shared interests" headline is derived on the page from
// getInterestPool().length (lib/interests.ts) — the SAME distinct pool that
// feeds the InterestTiles mosaic — so the count and the on-screen tiles stay in
// lockstep. A child-only count query used to live here; it under-counted by
// omitting parent_interests that the mosaic DOES show, so it was removed.

// Counts of parents by builder interest (stored in extra.builderInterest):
// "builder" = technical, "aspiring" = non-technical learning to build.
export async function getBuilderCounts(): Promise<{ technical: number; curious: number }> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      count(*) FILTER (WHERE extra->>'builderInterest' = 'builder')::int AS technical,
      count(*) FILTER (WHERE extra->>'builderInterest' = 'aspiring')::int AS curious
    FROM signups
    WHERE extra->>'notified' = 'true'
  `) as Array<{ technical: number; curious: number }>;
  return { technical: rows[0]?.technical ?? 0, curious: rows[0]?.curious ?? 0 };
}

// Number of OHS students (current students + alumni) who have also opted in as
// builders (extra.builderInterest = 'builder'). Used on the home footer
// ("…and N students building Pixel Parents"). Mirrors getBuilderCounts: raw
// getSql with explicit columns, so no ensureFamiliesSchema() SELECT * concern.
export async function getStudentBuilderCount(): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT count(*)::int AS c
    FROM signups
    WHERE ohs_affiliation = ANY(${STUDENT_AFFILIATIONS})
      AND extra->>'builderInterest' = 'builder'
  `) as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

// Thanks-page editor: a signup + its children, used to pre-fill the family form
// so returning parents see (and don't accidentally wipe) what they submitted.
export async function getSignupForEdit(
  signupId: string,
): Promise<{ signup: SignupRow; kids: ChildRow[] } | null> {
  await ensureFamiliesSchema();
  const [signup] = await getDb()
    .select()
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1);
  if (!signup) return null;

  // Children are shared across the family, so load by familyId (not signupId) —
  // a co-parent sees + edits the same kids any family member added.
  const kids = await getDb()
    .select()
    .from(children)
    .where(eq(children.familyId, signup.familyId))
    .orderBy(children.createdAt);

  return { signup, kids };
}

// Public secret page: the parent + their children + the family's STUDENT accounts.
// Returns the row for any valid token; the /p page itself applies the
// share_visibility gate (ohs/private). `familyStudentAccounts` lets the profile
// view aggregate a child's accurate tag set (kid interests UNION the linked
// student account's expertise signals) — same enrichment the directory card does.
export type SharedProfile = {
  signup: SignupRow;
  kids: ChildRow[];
  familyStudentAccounts: SignupRow[];
};

export async function getSharedProfileByToken(token: string): Promise<SharedProfile | null> {
  await ensureFamiliesSchema();
  const [signup] = await getDb()
    .select()
    .from(signups)
    .where(eq(signups.shareToken, token))
    .limit(1);
  if (!signup) return null;

  // Show the whole family's shared children on the secret page, and load every
  // signup in the family so we can pick out the student accounts (a child may be
  // the same person as one of them — see lib/directory.aggregatedChildInterests).
  const [kids, familyMembers] = await Promise.all([
    getDb()
      .select()
      .from(children)
      .where(eq(children.familyId, signup.familyId))
      .orderBy(children.createdAt),
    getDb().select().from(signups).where(eq(signups.familyId, signup.familyId)),
  ]);
  const familyStudentAccounts = familyMembers.filter(
    (m) => ((m.extra ?? {}) as Record<string, unknown>).accountType === "student",
  );

  return { signup, kids, familyStudentAccounts };
}
