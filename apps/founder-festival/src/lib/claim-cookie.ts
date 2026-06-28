// The eval id a user is trying to claim, stashed in a short-lived cookie right
// before we hand off to Clerk's OAuth flow. Clerk's redirect chain frequently
// drops the `?e=<uuid>` query param (sign-up transfer, dashboard default
// redirect, etc.), dumping the user on the home page with no way to know which
// profile they meant to claim. This cookie survives the round-trip on the same
// domain, so /claim/callback (and the home page as a backstop) can recover the
// target and finish the claim instead of stranding them on home.
export const CLAIM_EVAL_COOKIE = "ff_claim_eval";

// 15 minutes — long enough for the OAuth detour (incl. email-link), short
// enough that a stale value can't mis-route a later, unrelated visit.
export const CLAIM_EVAL_COOKIE_MAX_AGE = 900;

// Client-side setter (call before authenticateWithRedirect / email-link send).
export function setClaimEvalCookie(evaluationId: string): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${CLAIM_EVAL_COOKIE}=${encodeURIComponent(evaluationId)}; ` +
    `path=/; max-age=${CLAIM_EVAL_COOKIE_MAX_AGE}; samesite=lax`;
}
