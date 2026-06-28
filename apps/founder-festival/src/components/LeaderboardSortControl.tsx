"use client";

import type { LeaderboardTab, LeaderboardDirection } from "@/lib/leaderboard-constants";

const COLUMNS: Array<{ key: LeaderboardTab; label: string }> = [
  { key: "founder", label: "Founder" },
  { key: "investor", label: "Investor" },
  { key: "combined", label: "Combined" },
];

// Mobile sort affordance. The mobile leaderboard renders cards (no column
// headers to click), so this segmented control stands in for them: tap a column
// to sort by it, tap the active column to flip direction. The ▼/▲ arrow matches
// the desktop headers (▼ = highest→lowest, ▲ = lowest→highest).
export function LeaderboardSortControl({
  sort,
  direction,
  onSort,
  className = "",
}: {
  sort: LeaderboardTab;
  direction: LeaderboardDirection;
  onSort: (column: LeaderboardTab) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs uppercase tracking-[0.15em] text-zinc-500 shrink-0">
        Sort
      </span>
      <div className="inline-flex flex-1 rounded-md border border-zinc-800 overflow-hidden">
        {COLUMNS.map((c) => {
          const active = c.key === sort;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSort(c.key)}
              aria-pressed={active}
              className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {c.label}
              {active && (
                <span className="text-[9px]">{direction === "highest" ? "▼" : "▲"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
