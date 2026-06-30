import { getRequestByClerkUser } from "@/lib/db/api-keys";

// Whether the developer who OWNS a Sign-in app has approved API access. This is
// the bridge between the existing developer-trust gate (the API-key request →
// admin-approve flow) and the Sign-in-app liveness gate (lib/oauth/gating.ts):
// approving a developer's API access also activates their Sign-in apps.
//
// Kept out of lib/oauth/store.ts so the pure OAuth store doesn't depend on the
// api-keys table. Best-effort + fail-closed: any read error → treat as NOT
// approved (a Sign-in app must not go live on a DB hiccup).
export async function ownerApiAccessApproved(
  ownerClerkUserId: string | null | undefined,
): Promise<boolean> {
  if (!ownerClerkUserId) return false;
  try {
    const req = await getRequestByClerkUser(ownerClerkUserId);
    return req?.status === "approved";
  } catch {
    return false;
  }
}
