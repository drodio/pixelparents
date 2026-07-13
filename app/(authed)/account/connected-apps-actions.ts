"use server";

import { auth } from "@clerk/nextjs/server";
import { listConsentsForUser, revokeConsent } from "@/lib/oauth/store";

// Server actions backing the account-page "Connected apps" panel: list the apps
// the signed-in user has authorized via "Sign in with GoPixel", and revoke
// one (which deletes the grant AND burns all its refresh tokens). Auth-gated to the
// caller's Clerk user — the revoke is keyed on their user id, so they can only ever
// revoke their own grants.

export type ConnectedAppView = {
  clientId: string;
  name: string;
  scopes: string[];
  authorizedAt: string;
  lastUsedAt: string | null;
};

export async function getConnectedApps(): Promise<ConnectedAppView[]> {
  const { userId } = await auth();
  if (!userId) return [];
  try {
    const rows = await listConsentsForUser(userId);
    return rows.map((r) => ({
      clientId: r.client_id,
      name: r.name,
      scopes: r.scope.split(/\s+/).filter(Boolean),
      authorizedAt: r.created_at,
      lastUsedAt: r.last_used_at,
    }));
  } catch (e) {
    console.error("getConnectedApps failed:", e);
    return [];
  }
}

export type RevokeState = { error?: string; revoked?: string };

export async function revokeConnectedApp(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const { userId } = await auth();
  if (!userId) return { error: "You must be signed in." };
  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!clientId) return { error: "Missing app." };
  try {
    const ok = await revokeConsent(userId, clientId);
    // Intentionally NO revalidatePath("/account") here: the connected-apps query
    // filters on revoked_at IS NULL, so revalidating would drop the just-revoked
    // row and replace the client's "Access revoked." confirmation with the app
    // simply vanishing — ambiguous feedback for a security-sensitive action. The
    // AppRow keeps its persistent "revoked" state; the row is gone on the next
    // natural page load. (The grant + its refresh tokens are already burned.)
    return ok ? { revoked: clientId } : { error: "That app wasn't connected." };
  } catch (e) {
    console.error("revokeConnectedApp failed:", e);
    return { error: "Couldn't revoke access. Please try again." };
  }
}
