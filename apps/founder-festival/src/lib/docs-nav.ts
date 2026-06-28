// The /docs left-nav catalog. Pure data + helpers (no React) so it's testable
// and shared by the server layout and the client nav. Mirrors admin-nav.ts.

export type DocsNavItem = {
  // For a doc page this is its doc_pages.slug; for the support page it's "support".
  slug: string;
  label: string;
  emoji: string;
  href: string;
  kind: "doc" | "support";
};

// Order is the rendered nav order. Quickstart is the /docs index (href "/docs").
export const DOCS_NAV: DocsNavItem[] = [
  { slug: "quickstart", label: "Quickstart", emoji: "🚀", href: "/docs", kind: "doc" },
  { slug: "profiles", label: "Profiles", emoji: "👤", href: "/docs/profiles", kind: "doc" },
  { slug: "leaderboard", label: "Leaderboard", emoji: "🏆", href: "/docs/leaderboard", kind: "doc" },
  { slug: "account", label: "Account", emoji: "⚙️", href: "/docs/account", kind: "doc" },
  { slug: "events", label: "Events", emoji: "📅", href: "/docs/events", kind: "doc" },
  { slug: "support", label: "Support", emoji: "💬", href: "/docs/support", kind: "support" },
];

// The doc slugs that map to a doc_pages row (everything except the support page).
export const DOC_PAGE_SLUGS = DOCS_NAV.filter((i) => i.kind === "doc").map((i) => i.slug);

export function isDocPageSlug(slug: string): boolean {
  return DOC_PAGE_SLUGS.includes(slug);
}

// Is `href` the active nav section for `pathname`? Matches the section root and
// nested routes (e.g. /docs/support/<id>) without matching a prefix sibling.
function isActiveNav(pathname: string, href: string): boolean {
  if (href === "/docs") return pathname === "/docs"; // index: exact only
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The single nav href to highlight for `pathname`: the LONGEST matching entry
// (so /docs/support/abc highlights Support, not /docs by prefix). null if none.
export function docsActiveHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (isActiveNav(pathname, href) && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
