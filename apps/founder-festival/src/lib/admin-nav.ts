import type { Grant } from "./grants";

// The admin left-nav catalog. Each item is gated by RBAC grants (visible if the
// viewer has ANY of `anyGrant`) so roles can turn sections on/off. Pure data +
// helpers — no React — so it's testable and shared by the server layout (which
// resolves grants) and the client nav (which marks the active item).
export type AdminNavItem = {
  href: string;
  label: string;
  section: "main" | "events" | "superadmin";
  anyGrant: Grant[];
  // Shown to every admin regardless of grants (e.g. Credits — every role buys +
  // spends credits). Such items don't need an `anyGrant` match.
  alwaysOn?: boolean;
  // Shown ONLY to true super-admins (not role-admins who happen to hold every
  // grant). Bypasses the grant check entirely.
  superAdminOnly?: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  // "Credits & Spend" — one role-aware money view (/admin/spend). Always-on:
  // every admin has credits; super-admins additionally see revenue + global cost.
  { href: "/admin/spend", label: "Credits & Spend", section: "main", anyGrant: [], alwaysOn: true },
  { href: "/admin/profiles/new", label: "Bulk Score", section: "main", anyGrant: ["run_scoring_jobs"] },
  { href: "/admin/profiles", label: "Scored Profiles", section: "main", anyGrant: ["view_profiles"] },
  { href: "/admin/claimed", label: "Claimed Profiles", section: "main", anyGrant: ["view_profiles"] },
  // Events section — Manage Events plus Hosts/Sponsors (moved out of the
  // /admin/events page's top buttons into the left nav). Same events grants.
  { href: "/admin/events", label: "Manage Events", section: "events", anyGrant: ["create_events", "manage_events", "delete_events"] },
  { href: "/admin/hosts", label: "Hosts", section: "events", anyGrant: ["create_events", "manage_events", "delete_events"] },
  { href: "/admin/sponsors", label: "Sponsors", section: "events", anyGrant: ["create_events", "manage_events", "delete_events"] },
  { href: "/admin/pending", label: "Pending Items", section: "superadmin", anyGrant: ["manage_pending"] },
  { href: "/admin/access", label: "Admin Users", section: "superadmin", anyGrant: ["approve_admin_requests"] },
  { href: "/admin/roles", label: "Admin Roles", section: "superadmin", anyGrant: ["create_roles", "edit_roles"] },
  { href: "/admin/email-options", label: "Email options", section: "superadmin", anyGrant: [], superAdminOnly: true },
  { href: "/admin/support", label: "Support", section: "superadmin", anyGrant: [], superAdminOnly: true },
];

// The nav items a viewer with `grants` may see: always-on items, plus any item
// whose `anyGrant` the viewer has. super-admin-only items appear solely when
// `opts.superAdmin` is set (true super-admins), regardless of grants.
export function visibleNavItems(grants: Grant[], opts?: { superAdmin?: boolean }): AdminNavItem[] {
  const set = new Set<Grant>(grants);
  const superAdmin = opts?.superAdmin ?? false;
  return ADMIN_NAV.filter((item) => {
    if (item.superAdminOnly) return superAdmin;
    return item.alwaysOn || item.anyGrant.some((g) => set.has(g));
  });
}

// Is `href` the active nav section for the current `pathname`? Matches the
// section root and any nested route under it (e.g. /admin/profiles/<id>), without
// matching a prefix sibling like /admin/profiles-extended.
export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The single nav item to highlight for `pathname`: the LONGEST `hrefs` entry that
// isActiveNav-matches it (so /admin/profiles/new highlights "Bulk Score", not
// "Scored Profiles" by prefix). null when nothing matches.
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (isActiveNav(pathname, href) && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
