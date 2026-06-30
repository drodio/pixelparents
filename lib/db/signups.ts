import { eq, desc, sql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { signups, children, type SignupRow, type ChildRow } from "@/lib/db/schema/signups";
import { ensureFamiliesSchema } from "@/lib/db/ensure";

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

// Public secret page: the parent + their children. Returns the row for any valid
// token; the /p page itself applies the share_visibility gate (ohs/private).
export type SharedProfile = { signup: SignupRow; kids: ChildRow[] };

export async function getSharedProfileByToken(token: string): Promise<SharedProfile | null> {
  await ensureFamiliesSchema();
  const [signup] = await getDb()
    .select()
    .from(signups)
    .where(eq(signups.shareToken, token))
    .limit(1);
  if (!signup) return null;

  // Show the whole family's shared children on the secret page.
  const kids = await getDb()
    .select()
    .from(children)
    .where(eq(children.familyId, signup.familyId))
    .orderBy(children.createdAt);

  return { signup, kids };
}
