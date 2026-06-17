import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { signups, children, type SignupRow, type ChildRow } from "@/lib/db/schema/signups";

// Share state for the management UI (thanks + account pages).
export type ShareState = {
  signupId: string;
  enabled: boolean;
  token: string | null;
  fields: string[] | null;
};

export async function getShareState(signupId: string): Promise<ShareState | null> {
  const [row] = await getDb()
    .select({
      id: signups.id,
      shareEnabled: signups.shareEnabled,
      shareToken: signups.shareToken,
      shareFields: signups.shareFields,
    })
    .from(signups)
    .where(eq(signups.id, signupId))
    .limit(1);
  if (!row) return null;
  return {
    signupId: row.id,
    enabled: row.shareEnabled,
    token: row.shareToken,
    fields: row.shareFields,
  };
}

// Map a signed-in user's email to their most recent signup (for /account).
export async function getSignupByEmail(email: string): Promise<SignupRow | null> {
  const [row] = await getDb()
    .select()
    .from(signups)
    .where(eq(signups.email, email))
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

  const kids = await getDb()
    .select()
    .from(children)
    .where(eq(children.signupId, signupId))
    .orderBy(children.createdAt);

  return { signup, kids };
}

// Public secret page: the parent + their children, only when sharing is on.
export type SharedProfile = { signup: SignupRow; kids: ChildRow[] };

export async function getSharedProfileByToken(token: string): Promise<SharedProfile | null> {
  const [signup] = await getDb()
    .select()
    .from(signups)
    .where(and(eq(signups.shareToken, token), eq(signups.shareEnabled, true)))
    .limit(1);
  if (!signup) return null;

  const kids = await getDb()
    .select()
    .from(children)
    .where(eq(children.signupId, signup.id))
    .orderBy(children.createdAt);

  return { signup, kids };
}
