"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Badge = { name: string; slug: string };

// Left-rail badge filter for /events (like the leaderboard filters). Multi-select
// with OR semantics; each toggle writes the badge slugs to the URL (?badge=a&badge=b)
// so the (server) page can filter and the view stays shareable.
export function EventBadgeFilter({ badges, selected }: { badges: Badge[]; selected: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedSet = new Set(selected);

  function toggle(slug: string) {
    const next = new Set(selectedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    const sp = new URLSearchParams(params.toString());
    sp.delete("badge");
    for (const s of next) sp.append("badge", s);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function clearAll() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("badge");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (badges.length === 0) return null;

  return (
    <aside className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Filter by badge
        </h2>
        {selectedSet.size > 0 && (
          <button type="button" onClick={clearAll} className="text-xs text-zinc-500 hover:text-zinc-300">
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 sm:flex-col sm:items-start">
        {badges.map((b) => {
          const on = selectedSet.has(b.slug);
          return (
            <button
              key={b.slug}
              type="button"
              onClick={() => toggle(b.slug)}
              aria-pressed={on}
              className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-[#dfa43a] bg-[#dfa43a] text-black font-medium"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
