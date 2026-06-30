"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { SUPPORTED_SCOPES, type SupportedScope } from "@/lib/oauth/config";
import { validateRedirectUris } from "@/lib/oauth/redirect";
import {
  registerClient,
  rotateClientSecret,
  listClientsByOwner,
  type OAuthClientRow,
} from "@/lib/oauth/store";

// Server actions backing the Developers-tab "Sign in with Pixel Parents" app
// registration. Self-serve for MVP (any signed-in user can register an app);
// admin approval before an app goes live is a v1 follow-up (see docs). All
// actions are auth-gated to the caller's Clerk user, and an app can only be
// managed by its owner.

export type RegisterState = {
  error?: string;
  // The one-time reveal — present only immediately after a successful register.
  reveal?: { clientId: string; clientSecret: string; name: string };
};

export async function registerOAuthApp(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const user = await currentUser();
  if (!user) return { error: "You must be signed in to register an app." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) {
    return { error: "Enter an app name (up to 120 characters)." };
  }

  // Redirect URIs: newline- or comma-separated in the textarea.
  const rawUris = String(formData.get("redirect_uris") ?? "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const validated = validateRedirectUris(rawUris);
  if (!validated.ok) return { error: validated.error };

  // Scopes: checkboxes named "scope". Always force-include openid. Cap to the
  // supported set (MVP: openid, email, ohs_verified).
  const requested = formData.getAll("scope").map(String);
  const scopes = Array.from(
    new Set<SupportedScope>([
      "openid",
      ...requested.filter((s): s is SupportedScope =>
        (SUPPORTED_SCOPES as readonly string[]).includes(s),
      ),
    ]),
  );

  try {
    const { client, clientSecret } = await registerClient({
      name,
      redirectUris: validated.uris,
      allowedScopes: scopes,
      createdBy: user.id,
    });
    revalidatePath("/dashboard/developers");
    return { reveal: { clientId: client.client_id, clientSecret, name: client.name } };
  } catch (e) {
    console.error("registerOAuthApp failed:", e);
    return { error: "Couldn't register the app. Please try again." };
  }
}

export type RotateState = {
  error?: string;
  reveal?: { clientId: string; clientSecret: string };
};

export async function rotateOAuthSecret(
  _prev: RotateState,
  formData: FormData,
): Promise<RotateState> {
  const user = await currentUser();
  if (!user) return { error: "You must be signed in." };
  const dbId = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  if (!dbId) return { error: "Missing app id." };
  try {
    const secret = await rotateClientSecret(dbId, user.id);
    if (!secret) return { error: "App not found, or you don't own it." };
    revalidatePath("/dashboard/developers");
    return { reveal: { clientId, clientSecret: secret } };
  } catch (e) {
    console.error("rotateOAuthSecret failed:", e);
    return { error: "Couldn't rotate the secret. Please try again." };
  }
}

// Read helper for the page (server component) — the caller's registered apps.
export async function getMyOAuthApps(): Promise<OAuthClientRow[]> {
  const user = await currentUser();
  if (!user) return [];
  try {
    return await listClientsByOwner(user.id);
  } catch (e) {
    console.error("getMyOAuthApps failed:", e);
    return [];
  }
}
