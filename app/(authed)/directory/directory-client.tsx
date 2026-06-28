"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { iconForInterest } from "@/lib/interest-icons";

// One card's worth of data, already gated server-side: every field present here
// is one the parent opted into sharing. The client never sees a hidden field.
export type DirectoryCard = {
  token: string;
  name: string;
  firstName: string;
  location: string | null;
  // Children the parent chose to share (name/grade/interests). Empty when the
  // "children" field wasn't shared.
  children: { firstName: string; grade: string | null; interests: string[] }[];
  // Deduped parent + child interests the parent chose to share — drives the
  // chips and the interest filter. Empty when neither field was shared.
  interests: string[];
  heroUrl: string | null;
  thumbUrls: string[];
};

type SortKey = "name" | "child";
type SortDir = "asc" | "desc";

// Cap the user's chosen column count so cards stay readable on smaller screens.
function maxColsForWidth(width: number): number {
  if (width < 560) return 1;
  if (width < 800) return 2;
  if (width < 1100) return 3;
  if (width < 1400) return 5;
  return 10;
}

function useViewportWidth(): number {
  // Start wide so the first server/client render matches and doesn't clamp the
  // grid before hydration; the effect corrects it on mount.
  const [width, setWidth] = useState(1440);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function Card({ card, wide }: { card: DirectoryCard; wide: boolean }) {
  const thumbs = card.thumbUrls.slice(0, 4);
  const childNames = card.children.map((c) => c.firstName).filter(Boolean);

  const hero = (
    <div
      className={
        wide
          ? "relative h-40 w-56 shrink-0 overflow-hidden rounded-xl sm:h-44 sm:w-64"
          : "relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl"
      }
    >
      {card.heroUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.heroUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-400/15 via-white/[0.04] to-black">
          <span className="text-3xl font-semibold text-white/40">
            {card.firstName.slice(0, 1).toUpperCase() || "?"}
          </span>
        </div>
      )}
    </div>
  );

  const body = (
    <div className={wide ? "flex min-w-0 flex-1 flex-col gap-2" : "flex flex-col gap-2 p-4"}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-base font-semibold text-white">{card.name}</h3>
      </div>
      {card.location && <p className="text-sm text-white/55">{card.location}</p>}
      {childNames.length > 0 && (
        <p className="text-sm text-amber-400/90">
          {childNames.join(", ")}
        </p>
      )}
      {card.interests.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {card.interests.slice(0, wide ? 12 : 6).map((t) => {
            const Icon = iconForInterest(t);
            return (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {t}
              </span>
            );
          })}
          {card.interests.length > (wide ? 12 : 6) && (
            <span className="self-center text-xs text-white/40">
              +{card.interests.length - (wide ? 12 : 6)}
            </span>
          )}
        </div>
      )}
      {thumbs.length > 0 && (
        <div className="mt-auto flex gap-1.5 pt-2">
          {thumbs.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              referrerPolicy="no-referrer"
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Link
      href={`/p/${card.token}`}
      className={
        wide
          ? "group flex gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-amber-400/40 hover:bg-white/[0.04]"
          : "group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-colors hover:border-amber-400/40 hover:bg-white/[0.04]"
      }
    >
      {hero}
      {body}
    </Link>
  );
}

export function DirectoryClient({ cards }: { cards: DirectoryCard[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [density, setDensity] = useState(2);

  const viewportWidth = useViewportWidth();
  const effectiveCols = Math.min(density, maxColsForWidth(viewportWidth));

  // Distinct interests across all visible cards, deduped case-insensitively but
  // keeping the first-seen display label.
  const allInterests = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const c of cards) {
      for (const i of c.interests) {
        const k = i.toLowerCase();
        if (!byKey.has(k)) byKey.set(k, i);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const toggleInterest = (label: string) => {
    const key = label.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = cards.filter((c) => {
      // Interest filter: OR — match any selected interest.
      if (selected.size > 0) {
        const cardKeys = new Set(c.interests.map((i) => i.toLowerCase()));
        let any = false;
        for (const s of selected) {
          if (cardKeys.has(s)) {
            any = true;
            break;
          }
        }
        if (!any) return false;
      }
      // Search: parent name, any child name, or any interest (substring).
      if (q) {
        const haystack = [
          c.name,
          ...c.children.map((k) => k.firstName),
          ...c.interests,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const av =
        sortKey === "name" ? a.name : a.children[0]?.firstName ?? "";
      const bv =
        sortKey === "name" ? b.name : b.children[0]?.firstName ?? "";
      return av.localeCompare(bv) * dir;
    });
    return sorted;
  }, [cards, query, selected, sortKey, sortDir]);

  const controlCls =
    "rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50";

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, child, or interest…"
            className={`${controlCls} min-w-[14rem] flex-1`}
          />
          <label className="flex items-center gap-2 text-sm text-white/60">
            Sort
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className={controlCls}
            >
              <option value="name">Parent name</option>
              <option value="child">Child name</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className={`${controlCls} hover:bg-white/10`}
            aria-label="Toggle sort direction"
          >
            {sortDir === "asc" ? "↑ A–Z" : "↓ Z–A"}
          </button>
          <label className="flex items-center gap-2 text-sm text-white/60">
            Per row
            <select
              value={density}
              onChange={(e) => setDensity(Number(e.target.value))}
              className={controlCls}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Interest filter chips */}
        {allInterests.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {allInterests.map((label) => {
              const active = selected.has(label.toLowerCase());
              const Icon = iconForInterest(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleInterest(label)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-amber-400 bg-amber-400 text-black"
                      : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  {label}
                </button>
              );
            })}
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-2 text-xs text-white/45 hover:text-white/80"
              >
                Clear filters ✕
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-white/45">
        {visible.length} {visible.length === 1 ? "family" : "families"}
        {selected.size > 0 || query.trim() ? " match your filters" : " shared with OHS families"}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/50">
          No families match your filters.
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))` }}
        >
          {visible.map((c) => (
            <Card key={c.token} card={c} wide={effectiveCols === 1} />
          ))}
        </div>
      )}
    </div>
  );
}
