"use server";

import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getClientByClientId, issueAuthCode } from "@/lib/oauth/store";
import { validateAuthorize, type AuthorizeParams } from "@/lib/oauth/authorize";

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

  // Deny → redirect back with the standard access_denied error.
  if (decision !== "allow") {
    redirect(appendParams(v.redirectUri, { error: "access_denied", state: v.state }));
  }

  // Allow → issue a single-use, short-lived code bound to this client + redirect
  // + PKCE challenge + the authenticated user, then redirect back with code+state.
  const user = await currentUser();
  const email = primaryEmail(user);
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
