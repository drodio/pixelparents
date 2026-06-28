"use client";

import Link from "next/link";
import { HeaderSearch } from "./HeaderSearch";

export type SiteHeaderNavPage = "profile" | "account" | "leaderboard" | "events" | "changelog" | "docs";

type Props = {
  // The page the user is currently on. Renders this link in white (no link
  // behavior); the others are gold links.
  currentPage: SiteHeaderNavPage;
  // The logged-in user's own profile URL. Null when we don't know it
  // (signed-out, or signed-in-but-unclaimed). Drives whether the "Profile"
  // link is shown at all on non-profile pages.
  userProfileHref: string | null;
  // Whether the user has a Clerk session. Controls whether the "Account"
  // link is shown.
  isAuthed: boolean;
  // When true, the "Events" item always renders as a clickable link (even when
  // currentPage === "events"). Used on an event DETAIL page so the visitor can
  // get back to the events list — the detail page isn't the list itself.
  eventsAsLink?: boolean;
};

// Header navigation rendered next to the Founder Festival logo on /profile,
// /leaderboard, and /events. The "current" tab is white; others are gold.
// On non-profile pages we only show the Profile link when we know the
// viewer's own profile URL (claimed user).
export function SiteHeaderNav({
  currentPage,
  userProfileHref,
  isAuthed,
  eventsAsLink,
}: Props) {
  const isClaimedUser = !!userProfileHref;

  // Profile link only renders when we know the viewer's profile URL.
  // On the profile page itself, the "Profile" tab is white regardless of
  // whether we know their URL (they're literally on a profile page, even
  // if it's not theirs).
  const showProfile = currentPage === "profile" || isClaimedUser;
  const showAccount = isAuthed;

  return (
    <nav
      aria-label="Site navigation"
      className="flex items-center gap-3 sm:gap-4 text-sm font-medium"
    >
      {showProfile && (
        <NavItem
          label="Profile"
          href={userProfileHref ?? "#"}
          isActive={currentPage === "profile"}
        />
      )}
      {showAccount && (
        <NavItem
          label="Account"
          href="/account"
          isActive={currentPage === "account"}
        />
      )}
      <NavItem
        label="Leaderboard"
        href="/leaderboard"
        isActive={currentPage === "leaderboard"}
      />
      {/* Events is a public page — always link straight to it (no claim gate),
          so signed-out visitors browsing a profile can reach it directly. */}
      <NavItem
        label="Events"
        href="/events"
        isActive={currentPage === "events" && !eventsAsLink}
      />
      {/* Docs is a public page — always link straight to it. */}
      <NavItem
        label="Docs"
        href="/docs"
        isActive={currentPage === "docs"}
      />
      <HeaderSearch />
    </nav>
  );
}

function NavItem({
  label,
  href,
  isActive,
  onClick,
}: {
  label: string;
  href: string;
  isActive: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  // Active tab: white text, no hover effect (it's already the current page).
  // Inactive: gold link with subtle hover brighten.
  if (isActive) {
    return (
      <span className="text-white" aria-current="page">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onClick}
      className="text-[#dfa43a] hover:text-amber-200 transition-colors"
    >
      {label}
    </Link>
  );
}
