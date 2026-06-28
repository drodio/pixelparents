import Link from "next/link";
import type { Crumb } from "@/lib/admin-breadcrumbs";

// Renders the admin breadcrumb trail (Admin › Section › Detail). Matches the
// /account breadcrumb style: amber links, › separators, current page in light
// zinc. Crumbs without an href render as plain text (the current page).
export function AdminBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-zinc-400">
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`}>
          {c.href ? (
            <Link
              href={c.href}
              className="text-amber-400 hover:text-amber-300 hover:underline underline-offset-4"
            >
              {c.label}
            </Link>
          ) : (
            <span className="text-zinc-200" aria-current="page">
              {c.label}
            </span>
          )}
          {i < crumbs.length - 1 && (
            <span className="mx-2 text-zinc-600" aria-hidden>
              ›
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
