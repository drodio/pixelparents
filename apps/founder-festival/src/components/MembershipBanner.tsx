"use client";

import { usePathname } from "next/navigation";

// The red "complete your membership" banner. Festival membership needs both an
// email AND a phone (for event invites/logistics), but the /developers flow is
// API access only — it just needs an email — so we suppress the banner there.
export function MembershipBanner({ needsSetup }: { needsSetup: boolean }) {
  const pathname = usePathname();
  if (!needsSetup) return null;
  if (pathname?.startsWith("/developers")) return null;
  return (
    <a
      href="/account/setup"
      className="block w-full bg-red-900 text-white text-center font-medium px-4 py-2 text-sm sm:text-base hover:bg-red-800 transition-colors"
    >
      Your account is not yet active. Add your email and phone to complete your
      membership.
    </a>
  );
}
