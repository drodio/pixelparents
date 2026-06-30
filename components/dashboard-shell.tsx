"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ApprovalStatus } from "@/lib/approval";
import { VerifiedBadge } from "@/components/verified-badge";
import {
  IconGrid,
  IconHome,
  IconUsers,
  IconCode,
  IconSettings,
  IconLock,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: IconGrid },
  { href: "/family", label: "Family", Icon: IconHome },
  // The old "Directory" tab was merged into Community: one consolidated showcase
  // (member grid + map + stats) with in-tab profile views. /directory now
  // redirects here, so a single nav item covers both.
  { href: "/community", label: "Community", Icon: IconUsers },
  // Developers now lives INSIDE the shell (no more new-tab jump): signed-in users
  // get the in-dashboard developer hub at /dashboard/developers. The public
  // marketing/docs page at /developers stays for signed-out / unauth visitors.
  { href: "/dashboard/developers", label: "Developers", Icon: IconCode },
];

// Persistent app shell: an icon rail on mobile that expands to a labelled
// sidebar on md+. Account + verification status live pinned at the bottom.
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

  return (
    <div className="min-h-dvh bg-black text-white">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r border-white/10 bg-zinc-950/80 backdrop-blur md:w-60">
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
          {items.map(({ href, label, Icon }) => {
            // Signed-out: tabs are visible but locked — grayed, non-interactive,
            // with a lock icon. They do nothing (no navigation, no data). This is
            // the visual prompt that drives users to sign in.
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
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-amber-400/15 text-amber-300"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-2 md:p-3">
          {authed ? (
            <>
              <div className="mb-2 hidden md:block">
                <VerifiedBadge status={status} />
              </div>
              <div className="mb-2 flex justify-center md:hidden">
                <VerifiedBadge status={status} compact />
              </div>
              <Link
                href="/account"
                title="Account settings"
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-white/5"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400/20 text-sm font-semibold text-amber-300">
                  {initial}
                </span>
                <span className="hidden min-w-0 flex-1 md:block">
                  <span className="block truncate font-medium text-white">
                    {firstName ?? "Account"}
                  </span>
                  <span className="block truncate text-xs text-white/55">{email ?? "Settings"}</span>
                </span>
                <IconSettings className="hidden h-4 w-4 shrink-0 text-white/40 md:block" />
              </Link>
            </>
          ) : (
            // Signed-out: a prominent Sign in CTA plus a secondary Create account
            // link, both routing into the auth flow. On the icon rail (mobile) we
            // collapse to a single lock button so it stays usable at 16px-wide.
            <div className="flex flex-col gap-2">
              <Link
                href="/sign-in?redirect_url=/dashboard"
                title="Sign in"
                className="flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-2 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
              >
                <IconLock className="h-4 w-4 shrink-0 md:hidden" />
                <span className="hidden md:inline">Sign in</span>
              </Link>
              <Link
                href="/sign-in?redirect_url=/dashboard"
                title="Create account"
                className="hidden items-center justify-center rounded-lg border border-white/15 px-2 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white md:flex"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </aside>

      <div className="pl-16 md:pl-60">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </div>
    </div>
  );
}
