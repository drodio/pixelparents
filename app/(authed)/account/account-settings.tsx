"use client";

import { UserProfile } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

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
        },
      }}
    />
  );
}
