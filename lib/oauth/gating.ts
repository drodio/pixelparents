import type { OAuthClientRow } from "./store";

// Approval gating for "Sign in with Pixel Parents" apps (the top V1 ask).
//
// A registered Sign-in app (an oauth_client) is only LIVE — able to complete
// /authorize + issue tokens — once it has been APPROVED. Approval can come from
// EITHER of two paths, mirroring the existing developer-trust model:
//
//   1. The owning developer's API access is approved. Approving a developer's API
//      access is the existing human-vetted "this is a real, trusted OHS builder"
//      gate (lib/db/api-keys.ts + lib/approval.ts). When that's granted, all of
//      that developer's Sign-in apps activate too — no second approval round-trip.
//
//   2. An admin approves the client itself (oauth_clients.status = 'approved'). A
//      per-client gate, used for apps whose owner isn't an approved API developer,
//      and the lever for extra scrutiny on apps requesting minor-data scopes.
//
// Until one of those holds, /authorize shows a "pending approval" state and /token
// refuses. This module is PURE (no DB) so the decision is unit-testable; the route
// supplies the two inputs (the client row + whether the owner's API access is
// approved).
//
// `status` values on oauth_clients:
//   'pending'  — registered, awaiting approval (the V1 default for new rows).
//   'approved' — an admin explicitly approved this client.
//   'rejected' — an admin rejected it; never live.
//   'active'   — LEGACY: MVP rows were created 'active' (self-serve, no gate). We
//                treat 'active' as approved so already-registered MVP apps keep
//                working after the upgrade (back-compat).

export type ClientLiveness =
  | { live: true; via: "client_approved" | "owner_api_approved" | "legacy_active" }
  | { live: false; reason: "rejected" | "pending" };

// The single source of truth for "is this Sign-in app live?". `ownerApiApproved`
// is whether the developer who registered the app has approved API access.
export function clientLiveness(
  client: Pick<OAuthClientRow, "status">,
  ownerApiApproved: boolean,
): ClientLiveness {
  if (client.status === "rejected") return { live: false, reason: "rejected" };
  if (client.status === "approved") return { live: true, via: "client_approved" };
  // Legacy MVP rows ('active') are grandfathered as approved.
  if (client.status === "active") return { live: true, via: "legacy_active" };
  // Otherwise 'pending' (or any unknown status): live ONLY if the owning
  // developer's API access is approved.
  if (ownerApiApproved) return { live: true, via: "owner_api_approved" };
  return { live: false, reason: "pending" };
}

export function isClientLive(
  client: Pick<OAuthClientRow, "status">,
  ownerApiApproved: boolean,
): boolean {
  return clientLiveness(client, ownerApiApproved).live;
}

// The status to show a developer for their own app in the Developers tab.
// 'live' collapses both approval paths; 'pending'/'rejected' map straight through.
export type DeveloperFacingStatus = "live" | "pending" | "rejected";

export function developerFacingStatus(
  client: Pick<OAuthClientRow, "status">,
  ownerApiApproved: boolean,
): DeveloperFacingStatus {
  const l = clientLiveness(client, ownerApiApproved);
  if (l.live) return "live";
  return l.reason === "rejected" ? "rejected" : "pending";
}
