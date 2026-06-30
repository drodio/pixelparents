// Growth referral links — the "spread the word" half of invites.
//
// The co-parent invite flow (lib/family.ts, lib/invite.ts) brings a SECOND
// parent into an EXISTING family. These helpers do the other thing: they let a
// family (or a verified student) pull a BRAND-NEW family/student into Pixel
// Parents by sharing a public signup link. We reuse the family's existing,
// hard-to-guess `inviteToken` as the referral attribution code — no new table,
// no new secret, no PII in the URL.
//
// A referral link lands on the normal /signup flow with a `?ref=<token>` (and,
// for student referrals, `&as=student`). The signup action stores a SANITIZED
// ref token in the new signup's `extra.referredBy` jsonb for future credit. The
// token is opaque attribution only — it grants no access and exposes nothing
// about the referrer, so it's safe in a shared link.

import { getBaseUrl } from "@/lib/url";

// URL query param carrying the referral attribution token.
export const REFERRAL_PARAM = "ref";
// URL query param marking a student-to-student referral (so the signup form can
// default the new account to the student flow).
export const REFERRAL_AS_PARAM = "as";

// Referral tokens are reused family invite tokens: base64url (24 random bytes →
// 32 chars). We bound length + charset so a hostile `?ref=` can't smuggle junk
// into `extra` or be used as an injection vector when echoed back.
const REF_TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Validate + normalize a referral token coming off a URL (or form field). Returns
// the clean token, or null if it's missing/garbage. Pure — no DB lookup; an
// unknown-but-well-formed token is simply stored as provenance and resolved (or
// ignored) later. Never throws.
export function sanitizeRefToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || !REF_TOKEN_RE.test(t)) return null;
  return t;
}

// Build a public signup referral URL from an explicit base (pure / testable).
// `student` switches the link to the student-to-student variant.
export function signupReferralUrl(
  baseUrl: string,
  token: string,
  opts: { student?: boolean } = {},
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const tok = sanitizeRefToken(token);
  const params = new URLSearchParams();
  if (tok) params.set(REFERRAL_PARAM, tok);
  if (opts.student) params.set(REFERRAL_AS_PARAM, "student");
  const qs = params.toString();
  return `${base}/signup${qs ? `?${qs}` : ""}`;
}

// Server convenience: a "invite another OHS family" link for a referrer's token.
export function familyReferralLinkFor(token: string): string {
  return signupReferralUrl(getBaseUrl(), token);
}

// Server convenience: a student-to-student referral link for a referrer's token.
export function studentReferralLinkFor(token: string): string {
  return signupReferralUrl(getBaseUrl(), token, { student: true });
}
