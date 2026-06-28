"use client";

import { type ComponentType, useState } from "react";
import { usePathname } from "next/navigation";
import { FiBarChart2, FiCalendar, FiUser, FiUserCheck, FiDollarSign, FiMenu, FiX } from "react-icons/fi";
import { FaCoins } from "react-icons/fa";
import type { Grant } from "@/lib/grants";
import { visibleNavItems, activeNavHref } from "@/lib/admin-nav";

// Icons for the "main" nav sections (the superadmin section stays icon-less).
// Credits is the $-coin; Bulk Score mirrors the hub card's bar-chart; Scored
// Profiles is a person; Claimed Profiles is the same person with a check (it's a
// claimed/verified person); Spend (our AI/Exa cost) is a dollar sign.
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/admin/credits": FaCoins,
  "/admin/profiles/new": FiBarChart2,
  "/admin/profiles": FiUser,
  "/admin/claimed": FiUserCheck,
  "/admin/spend": FiDollarSign,
  "/admin/events": FiCalendar,
};

// Left admin nav. Items are RBAC-gated (visibleNavItems(grants)); each is a gold
// link, white when it's the active section. The server layout resolves `grants`.
//
// Responsive: on md+ this is the classic fixed-width left sidebar. Below md the
// sidebar would eat half a phone screen, so it collapses to a full-width top bar
// (wordmark + env pill + hamburger) that opens a slide-in drawer with the same
// links. The desktop <aside> and the mobile bar share one items list so they
// never drift.
export function AdminNav({
  grants,
  isSuperAdmin = false,
  envLabel,
  envColor,
  host,
  pendingCount = 0,
}: {
  grants: Grant[];
  // True super-admins see super-admin-only nav items (e.g. Email options, Support).
  isSuperAdmin?: boolean;
  envLabel: string;
  envColor: string;
  host: string;
  pendingCount?: number;
}) {
  const pathname = usePathname() ?? "";
  const items = visibleNavItems(grants, { superAdmin: isSuperAdmin });
  const activeHref = activeNavHref(pathname, items.map((i) => i.href));
  const main = items.filter((i) => i.section === "main");
  const eventsItems = items.filter((i) => i.section === "events");
  const superitems = items.filter((i) => i.section === "superadmin");

  // Mobile drawer open/close. The nav items are plain <a> links (full-page
  // navigation), so tapping one reloads the page and the drawer resets anyway;
  // we also close it on the click (bubbled from the links) for an instant,
  // flash-free dismiss.
  const [open, setOpen] = useState(false);

  const cls = (href: string) =>
    `py-1 transition-colors ${
      href === activeHref ? "text-white" : "text-[#dfa43a] hover:text-[#e6b860]"
    }`;

  const envPill = (
    <span
      className="text-xs font-mono uppercase tracking-[0.2em] px-2 py-1 rounded border"
      style={{ color: envColor, borderColor: envColor }}
      title={host}
    >
      {envLabel}
    </span>
  );

  // The link list, shared by the desktop sidebar and the mobile drawer.
  const navLinks = (
    <nav className="flex flex-col gap-1 text-sm">
      {main.map((i) => {
        const Icon = ICONS[i.href];
        return (
          <a key={i.href} href={i.href} className={`flex items-center gap-2 ${cls(i.href)}`}>
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            {i.label}
          </a>
        );
      })}

      {eventsItems.length > 0 && (
        <>
          <div className="mt-4 text-xs uppercase tracking-[0.2em] text-zinc-600">Events:</div>
          {eventsItems.map((i) => (
            <a key={i.href} href={i.href} className={cls(i.href)}>
              {i.label}
            </a>
          ))}
        </>
      )}

      {superitems.length > 0 && (
        <>
          <div className="mt-4 text-xs uppercase tracking-[0.2em] text-zinc-600">Superadmin:</div>
          {superitems.map((i) => (
            <a key={i.href} href={i.href} className={cls(i.href)}>
              {i.label}
              {i.href === "/admin/pending" && pendingCount > 0 && (
                <>
                  {" ("}
                  <span className="font-bold text-red-500">{pendingCount}</span>
                  {")"}
                </>
              )}
            </a>
          ))}
        </>
      )}
    </nav>
  );

  return (
    <>
      {/* Desktop: fixed-width left sidebar (unchanged from the original). */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-zinc-800 px-5 py-6 flex-col gap-6">
        <a href="/admin" className="font-display text-xl font-bold tracking-tight text-white">
          admin
        </a>
        {navLinks}
        <span className="mt-auto self-start" title={host}>
          {envPill}
        </span>
      </aside>

      {/* Mobile: full-width top bar. Sticky so the hamburger stays reachable as
          long tables scroll. */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-zinc-800 bg-[#151515] px-4 py-3">
        <a href="/admin" className="font-display text-lg font-bold tracking-tight text-white">
          admin
        </a>
        <div className="flex items-center gap-3">
          {envPill}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open admin menu"
            className="inline-flex items-center justify-center rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:text-white hover:border-zinc-500"
          >
            <FiMenu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer + backdrop. */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 bottom-0 w-64 max-w-[85%] overflow-y-auto border-r border-zinc-800 bg-[#151515] px-5 py-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <a href="/admin" className="font-display text-xl font-bold tracking-tight text-white">
                admin
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close admin menu"
                className="inline-flex items-center justify-center rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:text-white hover:border-zinc-500"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            {/* Clicks bubble up from the nav links → dismiss the drawer instantly. */}
            <div onClick={() => setOpen(false)}>{navLinks}</div>
            <span className="mt-auto self-start">{envPill}</span>
          </div>
        </div>
      )}
    </>
  );
}
