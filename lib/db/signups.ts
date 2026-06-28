import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { signups, children, type SignupRow, type ChildRow } from "@/lib/db/schema/signups";

// Map a signed-in user's email to their most recent signup (for /account).
// Emails are stored as typed (not normalized), so match case-insensitively —
// matching the lowercasing convention used throughout lib/admin.ts.
export async function getSignupByEmail(email: string): Promise<SignupRow | null> {
  const [row] = await getDb()
    .select()
    .from(signups)
    .where(sql`lower(${signups.email}) = ${email.toLowerCase()}`)
    .orderBy(desc(signups.createdAt))
    .limit(1);
  return row ?? null;
}

// Thanks-page editor: a signup + its children, used to pre-fill the family form
// so returning parents see (and don't accidentally wipe) what they submitted.
export async function getSignupForEdit(
  signupId: string,
): Promise<{ signup: SignupRow; kids: ChildRow[] } | null> {
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
