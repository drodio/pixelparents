import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events, hosts, sponsors, supportTickets } from "@/db/schema";

// Breadcrumb trail for the admin area, derived from the URL path. Rendered once
// in the admin layout so every admin page gets "Admin › Section › Detail" for
// free. The last crumb (current page) has no href.

export type Crumb = { label: string; href?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Human labels for known path segments (collections and leaf sub-pages).
const STATIC_LABELS: Record<string, string> = {
  events: "Events",
  hosts: "Hosts",
  sponsors: "Sponsors",
  profiles: "Profiles",
  claimed: "Claimed",
  credits: "Credits",
  spend: "Spend",
  roles: "Roles",
  access: "Access",
  pending: "Pending",
  support: "Support",
  "email-options": "Email options",
  "nfx-refresh": "NFX Refresh",
  new: "New",
  badges: "Badges",
  recap: "Recap",
  personalized: "Personalized",
};

// For a dynamic id segment, resolve a friendly name based on the collection it
// sits under (the previous path segment). Best-effort: any failure falls back to
// a shortened id, so the breadcrumb never breaks a page.
const ID_RESOLVERS: Record<string, (id: string) => Promise<string | null>> = {
  events: async (id) =>
    (await db.select({ v: events.title }).from(events).where(eq(events.id, id)).limit(1))[0]?.v ?? null,
  hosts: async (id) =>
    (await db.select({ v: hosts.name }).from(hosts).where(eq(hosts.id, id)).limit(1))[0]?.v ?? null,
  sponsors: async (id) =>
    (await db.select({ v: sponsors.name }).from(sponsors).where(eq(sponsors.id, id)).limit(1))[0]?.v ?? null,
  support: async (id) =>
    (await db.select({ v: supportTickets.subject }).from(supportTickets).where(eq(supportTickets.id, id)).limit(1))[0]
      ?.v ?? null,
};

function titleCase(seg: string): string {
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export async function buildAdminBreadcrumbs(pathname: string): Promise<Crumb[]> {
  const clean = (pathname.split("?")[0] ?? "").replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean); // e.g. ["admin", "events", "<id>", "recap"]
  if (parts[0] !== "admin") return [];

  const crumbs: Crumb[] = [{ label: "Admin", href: "/admin" }];
  let href = "/admin";
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i]!;
    href += `/${seg}`;
    let label: string;
    if (STATIC_LABELS[seg]) {
      label = STATIC_LABELS[seg];
    } else if (UUID_RE.test(seg)) {
      const resolver = ID_RESOLVERS[parts[i - 1]!];
      const resolved = resolver ? await resolver(seg).catch(() => null) : null;
      label = resolved ?? shortId(seg);
    } else {
      label = titleCase(seg);
    }
    crumbs.push({ label, href });
  }
  // The current page (last crumb) is not a link.
  const last = crumbs[crumbs.length - 1]!;
  crumbs[crumbs.length - 1] = { label: last.label };
  return crumbs;
}
