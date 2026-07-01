"use client";

import { UserProfile } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

// Matches lib/clerk-appearance.ts's PANEL token so the embedded card keeps the
// same near-black panel color when we re-declare `card` to add sizing overrides.
const PANEL = "#111111";

// Embedded account-management UI. Previously the only way to edit your profile,
// email, or security settings was the small profile-picture <UserButton> popover
// in the header ("Manage account"), which is easy to miss. This drops Clerk's
// full <UserProfile /> right onto the /account page so it's obvious.
//
// Routing: "hash" keeps all of UserProfile's internal navigation in the URL
// fragment (e.g. /account#/security), so it embeds cleanly without needing a
// dedicated Next.js catch-all route. (The "path" strategy would require a
// /account/[[...rest]] route segment; "hash" avoids that entirely.)
//
// Theming: reuse the shared dark/amber `clerkAppearance` — the same appearance
// the ClerkProvider and UserButton use — so the embed matches the app instead of
// rendering Clerk's default white UI.
export function AccountSettings() {
  return (
    <UserProfile
      routing="hash"
      appearance={{
        ...clerkAppearance,
        elements: {
          ...clerkAppearance?.elements,
          // Let the card sit flush inside our section wrapper rather than
          // floating as a centered, max-width modal-style card.
          rootBox: { width: "100%" },
          cardBox: { width: "100%", maxWidth: "100%", boxShadow: "none" },
          // Tighten the embed so it reads as an intentional inline panel rather
          // than a roomy standalone page: drop the tall minimum height (which
          // left a big empty gap under short tabs like Profile) and trim the
          // scroll padding around the content. Card colors already come from the
          // shared `clerkAppearance.card` spread above; we only add sizing here.
          card: {
            backgroundColor: PANEL,
            borderColor: "rgba(255,255,255,0.10)",
            minHeight: "unset",
          },
          scrollBox: { minHeight: "unset" },
          pageScrollBox: { padding: "1.5rem" },
        },
      }}
    />
  );
}
