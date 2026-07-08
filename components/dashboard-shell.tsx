"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ApprovalStatus } from "@/lib/approval";
import { VerifiedBadge } from "@/components/verified-badge";
import { NotificationBell } from "@/components/notification-bell";
import { FeedbackWidget } from "@/components/feedback-widget";
import { FeedbackPrompt } from "@/components/feedback-prompt";
import { HelpButton } from "@/components/help-button";
import { WalkthroughTour } from "@/components/walkthrough-tour";
import { InstallPrompt } from "@/components/install-prompt";
import {
  IconGrid,
  IconHome,
  IconUsers,
  IconCode,
  IconSettings,
  IconLock,
  IconHeart,
  IconCalendar,
  IconBook,
  IconMenu,
  IconX,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: IconGrid },
  // "Community" is the bidirectional help board (route stays /community), placed
  // right below Dashboard: verified OHS families (parent OR student) post Asks ("I
  // need help") or Offers ("I can help") + get matched. The surface gates to
  // verified families; the tab shows for all authed users (unverified → a prompt).
  { href: "/community", label: "Community", Icon: IconHeart },
  // "Events" is the shared OHS calendar: a month grid of community-created events
  // plus the auto-imported Stanford OHS school-year calendar. Placed right after
  // Community; the surface gates to verified OHS families (like Community/Directory).
  { href: "/events", label: "Events", Icon: IconCalendar },
  // "Directory" is the consolidated member showcase (grid + map + stats) with
  // in-tab profile views, now served at /directory.
  { href: "/directory", label: "Directory", Icon: IconUsers },
  // "Resources" is the community RESOURCE BOARDS: Reddit-like, OHS-only,
  // permanent, community-curated boards. Any verified member can create a board
  // and add link/file/text contributions; boards + contributions are upvotable
  // and auto-labeled with topic tags. Placed right after Directory; the surface
  // gates to verified OHS families (like Community/Directory/Events).
  { href: "/resources", label: "Resources", Icon: IconBook },
  { href: "/family", label: "Family", Icon: IconHome },
  // Developers now lives INSIDE the shell (no more new-tab jump): signed-in users
  // get the in-dashboard developer hub at /dashboard/developers. The public
  // marketing/docs page at /developers stays for signed-out / unauth visitors.
  { href: "/dashboard/developers", label: "Developers", Icon: IconCode },
];

// On phones the bottom tab bar can only fit a handful of destinations, so it
// shows the four primary tabs (the rest — Family, Developers, Admin, Account —
// live in the slide-in "More" drawer). These hrefs MUST exist in `items`.
const MOBILE_PRIMARY_HREFS = ["/dashboard", "/community", "/resources", "/directory"];

// Persistent app shell. Desktop (md+): a fixed left sidebar — an icon rail that
// expands to labelled at md. Mobile (<md): a top bar (logo + bell + account) and
// a bottom tab bar for the primary tabs, with a slide-in drawer ("More") that
// exposes EVERY nav item plus account + verification status — so nothing on the
// rail is unreachable just because labels are hidden. Account + verification
// status live pinned at the bottom of the desktop sidebar.
export function DashboardShell({
  children,
  firstName,
  email,
  status,
  isAdmin = false,
  authed = true,
}: {
  children: React.ReactNode;
  firstName: string | null;
  email: string | null;
  status: ApprovalStatus | null;
  isAdmin?: boolean;
  // When false, the shell renders in "signed-out" mode: the nav items are grayed
  // out + non-interactive (a small lock icon hints why), the account row is
  // replaced by Sign in / Create account CTAs, and the caller passes a locked
  // prompt as children. No PII is ever rendered in this mode — the signed-out
  // page branches load zero DB data and pass null for firstName/email/status.
  authed?: boolean;
}) {
  const pathname = usePathname();
  const initial = (firstName?.[0] ?? email?.[0] ?? "?").toUpperCase();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Admin tab only ever shows for a real authed admin — never in signed-out mode.
  const items: NavItem[] =
    authed && isAdmin
      ? [...NAV, { href: "/admin", label: "Admin", Icon: IconSettings }]
      : NAV;

  // Resolve the single active tab. A nav item matches when the path equals it or
  // sits under it; when several match (e.g. /dashboard and /dashboard/developers
  // both match /dashboard/developers), the most specific (longest href) wins so
  // exactly one tab highlights.
  const activeHref =
    items
      .filter((i) => pathname === i.href || (pathname?.startsWith(`${i.href}/`) ?? false))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  // While the drawer is open: lock body scroll so the page behind doesn't scroll
  // under the overlay, and wire up Escape-to-close so keyboard/screen-reader users
  // have a dismiss affordance (the drawer is a blocking modal dialog). Drawer nav
  // links also close it via their own onClick.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  // The four primary destinations for the bottom tab bar (kept in nav order).
  const mobilePrimary = items.filter((i) => MOBILE_PRIMARY_HREFS.includes(i.href));

  // One nav link row, shared by the desktop sidebar and the mobile drawer.
  const navLink = (item: NavItem, onClick?: () => void) => {
    const { href, label, Icon } = item;
    // Signed-out: tabs are visible but locked — grayed, non-interactive, with a
    // lock icon. They do nothing (no navigation, no data).
    if (!authed) {
      return (
        <div
          key={href}
          title={`${label} — sign in to access`}
          aria-disabled="true"
          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/25"
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="hidden md:inline">{label}</span>
          <IconLock className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-white/30 md:block" />
        </div>
      );
    }
    const active = href === activeHref;
    return (
      <Link
        key={href}
        href={href}
        title={label}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          active
            ? "bg-amber-400/15 text-amber-300"
            : "text-white/60 hover:bg-white/5 hover:text-white"
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {/* In the drawer (onClick set) labels always show; on the desktop rail
            they appear only at md+. */}
        <span className={onClick ? "inline" : "hidden md:inline"}>{label}</span>
      </Link>
    );
  };

  // The account / sign-in block, shared by the desktop sidebar footer and drawer.
  const accountBlock = (mobile = false) =>
    authed ? (
      <>
        {/* "Send feedback" pinned DIRECTLY ABOVE the account chip (Daniel's note:
            the old landing feedback link was too hard to find). Reachable both on
            the desktop rail and in the mobile More drawer. */}
        <div className="mb-1">
          <FeedbackWidget variant={mobile ? "drawer" : "sidebar"} />
        </div>
        {mobile ? (
          <div className="mb-2">
            <VerifiedBadge status={status} />
          </div>
        ) : (
          <>
            <div className="mb-2 hidden md:block">
              <VerifiedBadge status={status} />
            </div>
            <div className="mb-2 flex justify-center md:hidden">
              <VerifiedBadge status={status} compact />
            </div>
          </>
        )}
        <Link
          href="/account"
          title="Account settings"
          data-tour="account"
          onClick={mobile ? () => setDrawerOpen(false) : undefined}
          className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-white/5"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400/20 text-sm font-semibold text-amber-300">
            {initial}
          </span>
          <span className={`${mobile ? "block" : "hidden md:block"} min-w-0 flex-1`}>
            <span className="block truncate font-medium text-white">
              {firstName ?? "Account"}
            </span>
            <span className="block truncate text-xs text-white/55">{email ?? "Settings"}</span>
          </span>
          <IconSettings
            className={`${mobile ? "block" : "hidden md:block"} h-4 w-4 shrink-0 text-white/40`}
          />
        </Link>
      </>
    ) : (
      // Signed-out: a prominent Sign in CTA plus a secondary Create account link.
      // On the icon rail (mobile sidebar) we collapse to a single lock button.
      <div className="flex flex-col gap-2">
        <Link
          href="/sign-in?redirect_url=/dashboard"
          title="Sign in"
          className="flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-2 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          <IconLock className={`h-4 w-4 shrink-0 ${mobile ? "hidden" : "md:hidden"}`} />
          <span className={mobile ? "inline" : "hidden md:inline"}>Sign in</span>
        </Link>
        <Link
          href="/signup"
          title="Create account"
          className={`${
            mobile ? "flex" : "hidden md:flex"
          } items-center justify-center rounded-lg border border-white/15 px-2 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white`}
        >
          Create account
        </Link>
      </div>
    );

  return (
    <div className="min-h-dvh bg-black text-white">
      {/* ---- Desktop sidebar (md+ only) -------------------------------------
          Unchanged from before: an icon rail that expands to a labelled sidebar
          at md. Hidden on phones, where the top bar + bottom tab bar take over. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-white/10 bg-zinc-950/80 backdrop-blur md:flex md:w-60">
        <Link
          href="/dashboard"
          className="flex h-16 items-center gap-2.5 px-3 md:px-5"
          aria-label="Pixel Parents dashboard"
        >
          <Image
            src="/images/pixel-mascot.png"
            alt=""
            width={72}
            height={72}
            className="h-9 w-9 rounded-lg object-cover"
          />
          <span className="hidden text-base font-semibold tracking-tight md:inline">
            Pixel Parents
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-3 md:px-3">
          {/* Notification bell — only for authed users. Self-fetches its own
              unread count, so no count prop has to be threaded through callers.
              Wrapped with data-tour so the walkthrough can spotlight it. */}
          {authed && (
            <span data-tour="notifications" className="block">
              <NotificationBell />
            </span>
          )}
          {items.map((item) => navLink(item))}
        </nav>

        <div className="border-t border-white/10 p-2 md:p-3">{accountBlock(false)}</div>
      </aside>

      {/* ---- Mobile top bar (<md only) -------------------------------------
          Logo + (authed) notification bell + account avatar. Keeps the bell and
          account reachable without opening the drawer. */}
      <header className="pt-safe h-safe-top fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-white/10 bg-zinc-950/85 px-3 backdrop-blur md:hidden">
        <Link
          href="/dashboard"
          className="flex items-center gap-2"
          aria-label="Pixel Parents dashboard"
        >
          <Image
            src="/images/pixel-mascot.png"
            alt=""
            width={64}
            height={64}
            className="h-8 w-8 rounded-lg object-cover"
          />
          <span className="text-base font-semibold tracking-tight">Pixel Parents</span>
        </Link>
        <div className="flex items-center gap-1">
          {/* Notification bell in the persistent top chrome so the unread badge is
              always visible on mobile (not buried in the "More" drawer). */}
          {authed && <NotificationBell />}
          {authed && (
            <Link
              href="/account"
              aria-label="Account settings"
              className="grid h-10 w-10 place-items-center rounded-full"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-400/20 text-sm font-semibold text-amber-300">
                {initial}
              </span>
            </Link>
          )}
          {!authed && (
            <Link
              href="/sign-in?redirect_url=/dashboard"
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* ---- Mobile bottom tab bar (<md only) ------------------------------
          The four primary destinations + a "More" button that opens the drawer.
          Sits above the iOS home indicator via the safe-area padding. */}
      <nav
        aria-label="Primary"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-white/10 bg-zinc-950/90 backdrop-blur md:hidden"
      >
        {mobilePrimary.map(({ href, label, Icon }) => {
          const active = href === activeHref;
          const base =
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium min-h-[3.25rem]";
          if (!authed) {
            return (
              <div
                key={href}
                aria-disabled="true"
                className={`${base} cursor-not-allowed text-white/25`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </div>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`${base} transition-colors ${
                active ? "text-amber-300" : "text-white/55 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="More navigation"
          aria-expanded={drawerOpen}
          className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-white/55 transition-colors hover:text-white"
        >
          <IconMenu className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* ---- Mobile slide-in drawer (the "More" menu) ----------------------
          Exposes EVERY nav item (labelled), notifications, account, and the
          verification badge — so the icon rail's hidden labels are never a
          dead end on a phone. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="pt-safe absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-white/10 bg-zinc-950 shadow-2xl"
          >
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <span className="text-base font-semibold tracking-tight">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="grid h-10 w-10 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
              {authed && <NotificationBell showLabel />}
              {items.map((item) => navLink(item, () => setDrawerOpen(false)))}
            </nav>
            <div className="pb-safe border-t border-white/10 p-3">{accountBlock(true)}</div>
          </div>
        </div>
      )}

      {/* Content. Desktop: offset by the sidebar. Mobile: offset by the top bar
          and leave room at the bottom for the tab bar (+ home-indicator inset). */}
      <div className="pt-safe-nav md:pl-60 md:pt-0">
        <div className="pb-mobile-nav mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 md:pb-8">
          {children}
        </div>
      </div>

      {/* Floating help (?) button + the guided walkthrough overlay — authed only.
          The button is fixed bottom-right (above the mobile tab bar, safe-area
          aware); the tour renders nothing until started from the help menu. */}
      {authed && (
        <>
          {/* Ambient, dismissible "share feedback" pill. Self-gates (once per
              session, re-surfaces ~weekly), reuses the existing FeedbackComposer,
              and positions itself clear of both the mobile tab bar and the Help
              button, so it's safe to mount app-wide here alongside them. */}
          <FeedbackPrompt />
          <HelpButton />
          <WalkthroughTour />
          {/* "Add to home screen" banner. The manifest's start_url is /dashboard
              and the whole product is the signed-in shell, so the marketing splash
              was the wrong (and only) place it surfaced — the users most likely to
              install never saw it. InstallPrompt self-gates (mobile only, hidden
              once installed or dismissed), so it's safe to mount app-wide here. */}
          <InstallPrompt />
        </>
      )}
    </div>
  );
}
