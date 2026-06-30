import { eq, desc, sql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { signups, children, type SignupRow, type ChildRow } from "@/lib/db/schema/signups";
import { ensureFamiliesSchema } from "@/lib/db/ensure";
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

// Total number of parents who have signed up. Used on /signup to show
// "Join N other Pixel Parents" as social proof.
export async function getSignupCount(): Promise<number> {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(signups);
  return row?.c ?? 0;
}

// Total number of kids (children) registered across all signups. Used on
// /signup ("Helping connect N OHS kids IRL").
export async function getChildrenCount(): Promise<number> {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(children);
  return row?.c ?? 0;
}

// Number of DISTINCT interests logged across all children (e.g. "K-pop",
// "chess"). Used on /signup ("around N shared interests IRL"). Case-insensitive
// and trimmed so "Chess" and "chess " count once.
export async function getInterestsCount(): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT count(DISTINCT lower(trim(i)))::int AS c
    FROM children, unnest(children.interests) AS i
    WHERE trim(i) <> ''
  `) as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

// Counts of parents by builder interest (stored in extra.builderInterest):
// "builder" = technical, "aspiring" = non-technical learning to build.
export async function getBuilderCounts(): Promise<{ technical: number; curious: number }> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      count(*) FILTER (WHERE extra->>'builderInterest' = 'builder')::int AS technical,
      count(*) FILTER (WHERE extra->>'builderInterest' = 'aspiring')::int AS curious
    FROM signups
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
