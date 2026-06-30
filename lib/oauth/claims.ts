import { isFamilyVerified } from "@/lib/directory";
import { isStudentAccount } from "@/lib/family-display";
import { OHS_AFFILIATIONS } from "@/lib/options";
import type { SignupRow, ChildRow } from "@/lib/db/schema/signups";
import type { SupportedScope } from "./config";
import { pairwiseFamilyId } from "./secrets";

// Build the OIDC ID-token / userinfo claim set from the authenticated user's Pixel
// Parents signup and the scopes they consented to. This is where the product
// lives: `ohs_verified` is a SIGNED assertion that the user is a verified Stanford
// OHS member, computed from the SAME verification model the directory uses
// (lib/directory.ts:isFamilyVerified). We READ that model; we never re-implement
// the rule, so the assertion can't drift from what the rest of the app considers
// "verified".
//
// Privacy by default (a minors community): a claim is emitted ONLY when its scope
// was both requested AND consented to. No scope ⇒ no claim. STUDENTS are coarsened
// by default — exactly mirroring the directory's minor-privacy rules: a student
// never exposes precise data, and `grade_band` is a BAND (middle/high), never the
// exact grade.

// The alumni affiliation label (OHS_AFFILIATIONS[4]) — a graduated OHS student.
// There is no `accountType: "alumni"`; alumni are distinguished by ohs_affiliation.
const ALUMNI_AFFILIATION = OHS_AFFILIATIONS[4];

// The slice of a signup the claim builder needs. SignupRow satisfies this; keeping
// it narrow lets tests pass a tiny fixture.
export type SignupForClaims = Pick<
  SignupRow,
  "extra" | "createdAt" | "ohsAffiliation" | "familyId"
>;

export type Role = "parent" | "student" | "alumni";
export type GradeBand = "middle" | "high";

export type IdTokenClaims = {
  email?: string;
  email_verified?: boolean;
  ohs_verified?: boolean;
  ohs_verified_method?: "student_email" | "admin" | "grandfathered";
  role?: Role;
  grade_band?: GradeBand;
  family_id?: string;
};

// Compute whether this user is a verified OHS member. A null signup (the user
// authenticated via Clerk but has no Pixel Parents signup on file) is NOT
// verified — the assertion must be backed by a real, approved/grandfathered row.
export function isOhsVerified(signup: SignupForClaims | null | undefined): boolean {
  if (!signup) return false;
  return isFamilyVerified(signup);
}

// How the user came to be verified, for the `ohs_verified_method` claim. Derived
// from the SAME provenance the rest of the app records:
//   approvalBy === "student-email" → the self-serve student-email code flow
//   approvalBy === "api-access"    → an admin approving the dev's API access
//   any other approvalBy           → an admin acted by name
//   no approval but grandfathered  → predates the verification cutoff
// Returns undefined when the user isn't verified at all (so we never emit a method
// for an unverified user).
export function ohsVerifiedMethod(
  signup: SignupForClaims | null | undefined,
): IdTokenClaims["ohs_verified_method"] {
  if (!signup || !isOhsVerified(signup)) return undefined;
  const extra = (signup.extra ?? {}) as Record<string, unknown>;
  const approvalBy = typeof extra.approvalBy === "string" ? extra.approvalBy : null;
  if (extra.approvalStatus === "approved") {
    if (approvalBy === "student-email") return "student_email";
    // "api-access" approvals and named-admin approvals are both an admin action.
    return "admin";
  }
  // Verified only because they predate the cutoff.
  return "grandfathered";
}

// The user's coarse role. Student accounts (extra.accountType === "student") are
// students; a non-student whose ohs_affiliation is the alumni label is "alumni";
// everyone else (the default) is a parent.
export function roleOf(signup: SignupForClaims | null | undefined): Role | undefined {
  if (!signup) return undefined;
  if (isStudentAccount(signup)) return "student";
  if (signup.ohsAffiliation === ALUMNI_AFFILIATION) return "alumni";
  return "parent";
}

// Coarsen an exact grade string ("7th".."12th") into a privacy-preserving band.
// 7th–8th → "middle"; 9th–12th → "high"; anything else (incl. "Not an OHS child")
// → undefined (no band emitted). We NEVER return or derive the exact grade — the
// band is the whole point (an exact grade is more identifying for a minor).
export function gradeBandOf(grade: string | null | undefined): GradeBand | undefined {
  const g = grade?.trim();
  if (g === "7th" || g === "8th") return "middle";
  if (g === "9th" || g === "10th" || g === "11th" || g === "12th") return "high";
  return undefined;
}

// The band to assert for the signed-in user, given the relevant grade rows.
//   - A STUDENT account: their own grade (the grade on the child row that links to
//     this student account, or — best-effort — the first OHS grade in the family).
//   - A PARENT account: parents don't have a grade band of their own. We could
//     surface a child's, but that mixes a minor's data into a parent's token; the
//     design ties `grade_band` to the (student) subject, so a parent gets none.
// `grades` is the candidate grade strings to coarsen (caller resolves which rows
// are relevant); we return the first that maps to a band.
export function studentGradeBand(
  signup: SignupForClaims | null | undefined,
  grades: ReadonlyArray<string | null | undefined>,
): GradeBand | undefined {
  if (!signup || roleOf(signup) !== "student") return undefined;
  for (const g of grades) {
    const band = gradeBandOf(g);
    if (band) return band;
  }
  return undefined;
}

// Inputs the claim builder needs beyond the scopes themselves.
export type ClaimInputs = {
  scopes: readonly SupportedScope[];
  // The client the token is FOR — required for the pairwise family_id.
  clientId: string;
  email: string | null;
  signup: SignupForClaims | null;
  // Grade rows to consider for grade_band (only used for a student subject). Pass
  // the family's children grades; the builder coarsens + bands, never the exact.
  childGrades?: ReadonlyArray<string | null | undefined>;
};

// Project the consented scopes into the additional ID-token / userinfo claims (the
// standard sub/iss/aud/exp/iat/nonce are added by the signer/route, not here). The
// pairwise `sub` is also added by the signer (it needs the client_id + user id);
// here we add only the scope-gated payload claims.
export function buildIdTokenClaims(args: ClaimInputs): IdTokenClaims {
  const claims: IdTokenClaims = {};
  const scopes = new Set(args.scopes);

  if (scopes.has("email") && args.email) {
    claims.email = args.email;
    // Clerk only surfaces verified primary emails for sign-in, so the email we
    // hold for a signed-in user is a confirmed address.
    claims.email_verified = true;
  }

  if (scopes.has("ohs_verified")) {
    claims.ohs_verified = isOhsVerified(args.signup);
    const method = ohsVerifiedMethod(args.signup);
    if (method) claims.ohs_verified_method = method;
  }

  if (scopes.has("role")) {
    const role = roleOf(args.signup);
    if (role) claims.role = role;
  }

  if (scopes.has("grade_band")) {
    const band = studentGradeBand(args.signup, args.childGrades ?? []);
    if (band) claims.grade_band = band;
  }

  if (scopes.has("family")) {
    const famId = pairwiseFamilyId(args.clientId, args.signup?.familyId ?? null);
    if (famId) claims.family_id = famId;
  }

  return claims;
}

// For a STUDENT account, the candidate grade is the grade on the child row whose
// student_email matches one of the account's verified emails (their own grade), or
// — if that link can't be made — any OHS grade among the family's children. Pure;
// the route resolves the family's children and passes them here.
export function candidateGradesForStudent(
  signup: SignupForClaims | null,
  children: ReadonlyArray<Pick<ChildRow, "grade" | "studentEmail">>,
  verifiedEmails: readonly string[],
): Array<string | null> {
  if (!signup || roleOf(signup) !== "student") return [];
  const verifiedSet = new Set(verifiedEmails.map((e) => e.trim().toLowerCase()));
  const own = children.filter((c) => {
    const e = c.studentEmail?.trim().toLowerCase();
    return e ? verifiedSet.has(e) : false;
  });
  const source = own.length > 0 ? own : children;
  return source.map((c) => c.grade ?? null);
}
