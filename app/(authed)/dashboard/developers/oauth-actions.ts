"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import {
  SUPPORTED_SCOPES,
  requestsMinorData,
  type SupportedScope,
} from "@/lib/oauth/config";
import { validateRedirectUris } from "@/lib/oauth/redirect";
import {
  registerClient,
  rotateClientSecret,
  listClientsByOwner,
} from "@/lib/oauth/store";
import { developerFacingStatus, type DeveloperFacingStatus } from "@/lib/oauth/gating";
import { ownerApiAccessApproved } from "@/lib/oauth/owner-approval";
import { notifyAdminNewOAuthApp } from "@/lib/oauth/notify";

// Server actions backing the Developers-tab "Sign in with GoPixel" app
// registration. Self-serve for MVP (any signed-in user can register an app);
// admin approval before an app goes live is a v1 follow-up (see docs). All
// actions are auth-gated to the caller's Clerk user, and an app can only be
// managed by its owner.

export type RegisterState = {
  error?: string;
  // The one-time reveal — present only immediately after a successful register.
  // Echoes back the saved redirect URIs + scopes so the developer can confirm the
  // app was stored exactly as intended (e.g. that a typo'd redirect URI wasn't
  // silently dropped by validation).
  reveal?: {
    clientId: string;
    clientSecret: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
  };
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
    // Alert an admin about the new app so the "extra review" the UI promises for
    // minor-data apps actually happens. Best-effort: never blocks registration.
    await notifyAdminNewOAuthApp({
      name: client.name,
      scopes,
      minorData: requestsMinorData(scopes),
      ownerId: user.id,
    });
    revalidatePath("/dashboard/developers");
    return {
      reveal: {
        clientId: client.client_id,
        clientSecret,
        name: client.name,
        redirectUris: client.redirect_uris,
        scopes: client.allowed_scopes,
      },
    };
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

// An app row shaped for the Developers-tab panel, with its developer-facing
// approval status resolved (live / pending / rejected).
export type MyOAuthApp = {
  id: string;
  name: string;
  client_id: string;
  redirect_uris: string[];
  allowed_scopes: string[];
  secret_prefix: string | null;
  authorization_count: number;
  created_at: string;
  liveStatus: DeveloperFacingStatus;
  reject_reason: string | null;
};

// Read helper for the page (server component) — the caller's registered apps,
// each annotated with its live/pending/rejected status. The owner's API-access
// approval is looked up ONCE (it's the same developer for all their apps).
export async function getMyOAuthApps(): Promise<MyOAuthApp[]> {
  const user = await currentUser();
  if (!user) return [];
  try {
    const [apps, ownerApproved] = await Promise.all([
      listClientsByOwner(user.id),
      ownerApiAccessApproved(user.id),
    ]);
    return apps.map((a) => ({
      id: a.id,
      name: a.name,
      client_id: a.client_id,
      redirect_uris: a.redirect_uris,
      allowed_scopes: a.allowed_scopes,
      secret_prefix: a.secret_prefix,
      authorization_count: a.authorization_count,
      created_at: a.created_at,
      liveStatus: developerFacingStatus(a, ownerApproved),
      reject_reason: a.reject_reason,
    }));
  } catch (e) {
    console.error("getMyOAuthApps failed:", e);
    return [];
  }
}
