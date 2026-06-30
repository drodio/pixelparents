"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { getMyUnreadCountAction } from "@/app/(authed)/notifications/actions";
import { formatUnreadBadge } from "@/lib/db/notifications";

// The notification BELL for the dashboard shell. Self-contained: it fetches its
// OWN unread count via a server action on mount (and re-fetches when the route
// changes — e.g. after the user visits the center and marks things read, or
// after any action that emits a notification), so callers of DashboardShell don't
// have to thread a count prop through every page. Renders a link to the
// notifications center with an unread-count badge. On-theme dark/amber; the badge
// caps at 9+ so it never blows out the 16px icon rail.
export function NotificationBell() {
  const pathname = usePathname();
  const [count, setCount] = useState<number>(0);
  const active = pathname === "/notifications" || (pathname?.startsWith("/notifications/") ?? false);

  const refresh = useCallback(() => {
    let cancelled = false;
    getMyUnreadCountAction()
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      .catch(() => {
        /* best-effort: a failed count just leaves the badge as-is */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetch on mount and whenever the path changes (covers "marked read on the
  // center" and "new notification after an action navigated here").
  useEffect(() => refresh(), [refresh, pathname]);

  // Also re-fetch when the tab regains focus, so a badge updated in another tab
  // (or after a background emit) reconciles without a full reload.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const badge = formatUnreadBadge(count);
  const label =
    count > 0 ? `Notifications — ${count} unread` : "Notifications";

  return (
    <Link
      href="/notifications"
      title={label}
      aria-label={label}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-amber-400/15 text-amber-300"
          : "text-white/60 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="relative shrink-0">
        <BellIcon className="h-5 w-5" />
        {badge.show && (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold leading-none text-black"
          >
            {badge.label}
          </span>
        )}
      </span>
      <span className="hidden md:inline">Notifications</span>
      {count > 0 && (
        <span className="ml-auto hidden rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 md:inline">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

// In-house bell glyph, matching the app's 24×24 stroke icon language (mirrors
// components/icons.tsx — defined here to keep the feature self-contained).
function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
