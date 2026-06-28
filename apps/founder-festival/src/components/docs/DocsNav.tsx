"use client";

import { type ComponentType, useState } from "react";
import { usePathname } from "next/navigation";
import { FiZap, FiUser, FiAward, FiSettings, FiCalendar, FiLifeBuoy, FiMenu } from "react-icons/fi";
import { DOCS_NAV, docsActiveHref } from "@/lib/docs-nav";

// React-icons (Feather) per nav slug — replaces the earlier emoji icons, matching
// the admin nav's icon treatment.
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  quickstart: FiZap,
  profiles: FiUser,
  leaderboard: FiAward,
  account: FiSettings,
  events: FiCalendar,
  support: FiLifeBuoy,
};

// Left docs nav. Mirrors AdminNav: desktop fixed-width left sidebar; below md it
// collapses to a top bar (Docs menu) opening an inline drawer with the same
// links. Active item is white; others are gold.
export function DocsNav() {
  const pathname = usePathname() ?? "";
  // Full-page <a> nav (matches AdminNav). hrefs come from DOCS_NAV (variables, not
  // literals) so next/no-html-link-for-pages doesn't flag them.
  const homeHref = DOCS_NAV[0]?.href ?? "/docs";
  const activeHref = docsActiveHref(pathname, DOCS_NAV.map((i) => i.href));
  const [open, setOpen] = useState(false);

  const cls = (href: string) =>
    `flex items-center gap-2 py-1 transition-colors ${
      href === activeHref ? "text-white" : "text-[#dfa43a] hover:text-[#e6b860]"
    }`;

  const docItems = DOCS_NAV.filter((i) => i.kind === "doc");
  const supportItems = DOCS_NAV.filter((i) => i.kind === "support");

  const renderItem = (i: (typeof DOCS_NAV)[number]) => {
    const Icon = ICONS[i.slug];
    return (
      <a key={i.href} href={i.href} className={cls(i.href)}>
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        {i.label}
      </a>
    );
  };

  const links = (
    <nav className="flex flex-col gap-1 text-sm" onClick={() => setOpen(false)}>
      {docItems.map(renderItem)}
      {supportItems.length > 0 && (
        <>
          <div className="my-2 border-t border-zinc-800" />
          {supportItems.map(renderItem)}
        </>
      )}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-52 shrink-0">
        <div className="sticky top-8">
          <a href={homeHref} className="mb-4 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Documentation
          </a>
          {links}
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mb-4 flex items-center gap-2 rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
          aria-expanded={open}
        >
          <FiMenu className="h-4 w-4" /> Docs menu
        </button>
        {open && (
          <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">{links}</div>
        )}
      </div>
    </>
  );
}
