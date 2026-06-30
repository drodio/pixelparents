"use server";

import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getClientByClientId, issueAuthCode, recordConsent, touchConsent } from "@/lib/oauth/store";
import { validateAuthorize, type AuthorizeParams } from "@/lib/oauth/authorize";
import { isClientLive } from "@/lib/oauth/gating";
import { ownerApiAccessApproved } from "@/lib/oauth/owner-approval";

// Server action backing the consent screen's Allow/Deny buttons. The hidden form
// fields carry the validated request parameters forward; we RE-VALIDATE them here
// (never trust the round-trip), re-check the Clerk session, and on Allow issue a
// single-use auth code + redirect back to the app. On Deny we redirect back with
// error=access_denied. All redirects use the EXACT registered redirect_uri.

function appendParams(redirectUri: string, params: Record<string, string | null>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, v);
  }
  return u.toString();
}

export async function decideConsent(formData: FormData): Promise<void> {
  const decision = String(formData.get("decision") ?? "");
  const raw: AuthorizeParams = {
    client_id: str(formData.get("client_id")),
    redirect_uri: str(formData.get("redirect_uri")),
    response_type: str(formData.get("response_type")),
    scope: str(formData.get("scope")),
    state: str(formData.get("state")),
    nonce: str(formData.get("nonce")),
    code_challenge: str(formData.get("code_challenge")),
    code_challenge_method: str(formData.get("code_challenge_method")),
  };

  // Must still be signed in (the action runs server-side under the Clerk session).
  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(buildAuthorizeUrl(raw))}`);
  }

  // Re-validate against the live client record — the form fields are attacker-
  // controllable, so the security decision is made here, not on the rendered page.
  const client = raw.client_id ? await getClientByClientId(raw.client_id) : null;
  const v = validateAuthorize(raw, client);
  if (!v.ok) {
    if (v.kind === "redirect") {
      redirect(appendParams(v.redirectUri, { error: v.error, state: v.state }));
    }
    // Fatal (bad client / redirect): bounce to a generic error page — never to an
    // unverified redirect_uri.
    redirect(`/oauth/authorize/error?reason=${encodeURIComponent(v.error)}`);
  }

  // Re-enforce the approval gate (never trust that the page checked it): an app
  // that isn't live can't be granted a code even if the form round-trips here.
  const ownerApproved = await ownerApiAccessApproved(v.client.created_by);
  if (!isClientLive(v.client, ownerApproved)) {
    redirect(`/oauth/authorize/error?reason=invalid_client`);
  }

  // Deny → redirect back with the standard access_denied error.
  if (decision !== "allow") {
    redirect(appendParams(v.redirectUri, { error: "access_denied", state: v.state }));
  }

  // Allow → remember the consent (so repeat logins skip this screen until revoked)
  // then issue a single-use, short-lived code bound to this client + redirect +
  // PKCE challenge + the authenticated user, and redirect back with code+state.
  const user = await currentUser();
  const email = primaryEmail(user);
  const scope = v.scopes.join(" ");
  await recordConsent(userId!, v.client.client_id, scope);
  const code = await issueAuthCode({
    clientId: v.client.client_id,
    redirectUri: v.redirectUri,
    codeChallenge: v.codeChallenge,
    scope,
    clerkUserId: userId!,
    email,
    nonce: v.nonce,
  });
  redirect(appendParams(v.redirectUri, { code, state: v.state }));
}

// Remembered-consent fast path: the page determined a live consent already covers
// the requested scopes, so we skip the Allow/Deny screen and issue a code directly.
// We STILL re-validate the request, re-check the session, and re-enforce the
// approval gate here — the page's decision is a UX hint, not the security boundary.
export async function issueCodeForRememberedConsent(raw: AuthorizeParams): Promise<void> {
  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(buildAuthorizeUrl(raw))}`);
  }

  const client = raw.client_id ? await getClientByClientId(raw.client_id) : null;
  const v = validateAuthorize(raw, client);
  if (!v.ok) {
    if (v.kind === "redirect") {
      redirect(appendParams(v.redirectUri, { error: v.error, state: v.state }));
    }
    redirect(`/oauth/authorize/error?reason=${encodeURIComponent(v.error)}`);
  }

  const ownerApproved = await ownerApiAccessApproved(v.client.created_by);
  if (!isClientLive(v.client, ownerApproved)) {
    redirect(`/oauth/authorize/error?reason=invalid_client`);
  }

  const user = await currentUser();
  const email = primaryEmail(user);
  await touchConsent(userId!, v.client.client_id);
  const code = await issueAuthCode({
    clientId: v.client.client_id,
    redirectUri: v.redirectUri,
    codeChallenge: v.codeChallenge,
    scope: v.scopes.join(" "),
    clerkUserId: userId!,
    email,
    nonce: v.nonce,
  });
  redirect(appendParams(v.redirectUri, { code, state: v.state }));
}

function str(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Rebuild the /oauth/authorize URL from the carried params (used to bounce a
// session-expired user back through Clerk and resume the same consent request).
function buildAuthorizeUrl(p: AuthorizeParams): string {
  const u = new URL("/oauth/authorize", "http://placeholder");
  for (const [k, val] of Object.entries(p)) {
    if (val) u.searchParams.set(k, String(val));
  }
  return u.pathname + u.search;
}
