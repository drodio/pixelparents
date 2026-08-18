// Pure rules for the end-of-onboarding "Add your student" invite (V2 round 3).
//
// Inviting a student CREATES a signup row in the inviting parent's family, so
// the decision of whether to create one at all is exactly the kind of thing
// that must be unit-testable without a DB — the same reason lib/family-links.ts
// exists. Getting it wrong mints duplicate accounts for one person.

// OHS addresses only: the invite email doubles as the address the student will
// verify with during their own onboarding.
export function looksLikeOhsEmail(raw: string): boolean {
  const e = (raw ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const domain = e.split("@")[1] ?? "";
  return domain === "stanford.edu" || domain.endsWith(".stanford.edu");
}

export type InviteDecision =
  // No account anywhere with that email — mint the student's row in this family.
  | { kind: "create" }
  // Already in THIS family — re-inviting resends the setup link, never duplicates.
  | { kind: "resend"; signupId: string }
  // Already an account in ANOTHER family — see below.
  | { kind: "blocked"; reason: string };

// `existing` is the signup that already owns this email, looked up
// CASE-INSENSITIVELY across every family (signups.email has no unique index and
// the signup form stores whatever case the member typed).
//
// The blocked case is the important one. signups.email is not unique and
// getSignupByEmail resolves an address most-recent-wins, so inserting a second
// row for an email that already has an account elsewhere doesn't just duplicate
// data — the NEW empty row, being newer, becomes the one that address resolves
// to. The student's real profile is left orphaned and they get dropped into the
// inviting parent's family. Joining two existing families is what the family
// LINK request flow is for, and that flow requires the other side to approve;
// an invite must never be able to do it silently.
export function decideStudentInvite(opts: {
  parentFamilyId: string;
  existing: { id: string; familyId: string } | null;
}): InviteDecision {
  const { parentFamilyId, existing } = opts;
  if (!existing) return { kind: "create" };
  if (existing.familyId === parentFamilyId) {
    return { kind: "resend", signupId: existing.id };
  }
  return {
    kind: "blocked",
    reason:
      "That email already has a GoPixel account. Ask them to link to your family from their Family page — we can't add an existing account to a family without their approval.",
  };
}
