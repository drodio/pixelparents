import Link from "next/link";

export type Crumb = { label: string; href?: string };

// Admin breadcrumb trail, e.g. GoPixel Admin › Parents › Daniel Odio.
// Items with an href are clickable; the last (current) item is plain text.
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {c.href ? (
              <Link href={c.href} className="text-amber-400 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className="text-white/80">{c.label}</span>
            )}
            {i < items.length - 1 && (
              <span aria-hidden className="text-white/30">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
