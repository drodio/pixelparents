"use client";

import { useEffect, useRef } from "react";
import type { LeaderboardRow, LeaderboardTab } from "@/lib/leaderboard";
import type { LeaderboardDirection } from "@/lib/leaderboard-constants";
import { Avatar } from "@/components/Avatar";
import { Badges } from "@/components/Badges";
import { ScoreThemPrompt } from "@/components/ScoreThemPrompt";
import { StatusMarker } from "@/components/FounderStatusMarker";

type Props = {
  rows: LeaderboardRow[];
  tab: LeaderboardTab;
  direction: LeaderboardDirection;
  onSort: (column: LeaderboardTab) => void;
  // Click-to-filter: clicking a (filterable) badge on a row toggles it as a
  // leaderboard filter. Threaded down to the Badges pills.
  onBadgeFilter?: (badgeId: string) => void;
  filterableBadgeIds?: readonly string[];
  // The ?e= row to scroll-to + subtly highlight ("the profile you came from").
  highlightEvalId: string | null;
  // The VIEWER's own claimed eval — the only row that gets the "you" label.
  youEvalId: string | null;
  // The active leaderboard search query (trimmed), or "" when not searching.
  // When a search settles with zero matches, the empty state offers to score
  // that person instead of the generic "No scored entries yet" line.
  searchQuery?: string;
  // True while a search is still in flight, so the empty state stays quiet
  // (the parent shows a "Searching…" count) rather than flashing a message.
  searchLoading?: boolean;
  // CONNECT MODE: drop the rank (#) column, the Founder/Investor/Combined score
  // columns, the sortable headers, and the founder/investor status markers.
  // Keeps the name/company/badges Name cell + facet-driven filtering. Default
  // false (full ranked leaderboard).
  connectMode?: boolean;
};

// Sortable score-column header. Only the active column shows a ▼ (highest→lowest)
// / ▲ (lowest→highest) arrow. Clicking navigates (handled by onSort) rather than
// sorting in place — the leaderboard is server-paginated, so a sort change
// re-queries from the top. Mirrors the admin tables' SortableTh affordance.
function SortableTh({
  column,
  label,
  thClass,
  sort,
  direction,
  onSort,
}: {
  column: LeaderboardTab;
  label: string;
  thClass: string;
  sort: LeaderboardTab;
  direction: LeaderboardDirection;
  onSort: (column: LeaderboardTab) => void;
}) {
  const active = column === sort;
  return (
    <th className={thClass}>
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-pressed={active}
        className={`inline-flex items-center justify-end gap-1 ml-auto hover:text-zinc-200 ${
          active ? "text-zinc-200" : ""
        }`}
      >
        {label}
        {active && (
          <span className="text-[8px]">{direction === "highest" ? "▼" : "▲"}</span>
        )}
      </button>
    </th>
  );
}

export function displayName(row: LeaderboardRow): string {
  if (row.nickname && row.nickname.trim()) return row.nickname.trim();
  if (row.fullName && row.fullName.trim()) return row.fullName.trim();
  // fallback: derive from linkedin URL handle
  const m = row.linkedinUrl.match(/linkedin\.com\/in\/([^/]+)/i);
  return m ? m[1]!.replace(/-/g, " ") : "Unknown";
}

function scoreFor(row: LeaderboardRow, tab: LeaderboardTab): number {
  if (tab === "founder") return row.founderScore;
  if (tab === "investor") return row.investorScore;
  return row.combinedScore;
}

// Avatar + name + company + badges block, shared by the desktop table cell and
// the mobile card so the two renderings can never drift.
function NameCell({
  row,
  isMe,
  onBadgeFilter,
  filterableBadgeIds,
}: {
  row: LeaderboardRow;
  isMe: boolean;
  onBadgeFilter?: (badgeId: string) => void;
  filterableBadgeIds?: readonly string[];
}) {
  return (
    <div className="flex items-start gap-2">
      <Avatar imageUrl={row.claimedImageUrl} name={displayName(row)} size="sm" />
      {/* flex-1 (not just min-w-0) so this column always fills the available
          width regardless of how many badges are shown. Without it the column
          sizes to content, and the badges "fit" measurement (which reads this
          column's width) becomes bistable — a row could collapse to its
          name-line width and then only fit one badge + "+N more". */}
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate">
            <a href={row.profileHref} className="link font-bold">
              {displayName(row)}
            </a>
            {row.companyName && (
              <span className="text-zinc-400">
                ,{" "}
                {row.companyUrl ? (
                  <a
                    href={row.companyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-zinc-200 hover:underline"
                    title={row.companyUrl}
                  >
                    {row.companyName}
                  </a>
                ) : (
                  row.companyName
                )}
              </span>
            )}
          </span>
          {row.badges.some((b) => b.id === "claimed") && (
            <span className="shrink-0">
              <Badges
                badges={row.badges.filter((b) => b.id === "claimed")}
                layout="fit"
                size="xs"
                onBadgeClick={onBadgeFilter}
                filterableBadgeIds={filterableBadgeIds}
              />
            </span>
          )}
          {isMe && (
            <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-[#dfa43a]">
              you
            </span>
          )}
        </div>
        {row.badges.filter((b) => b.id !== "claimed").length > 0 && (
          <Badges
            badges={row.badges.filter((b) => b.id !== "claimed")}
            layout="fit"
            size="xs"
            onBadgeClick={onBadgeFilter}
            filterableBadgeIds={filterableBadgeIds}
          />
        )}
      </div>
    </div>
  );
}

export function LeaderboardTable({
  rows,
  tab,
  direction,
  onSort,
  onBadgeFilter,
  filterableBadgeIds,
  highlightEvalId,
  youEvalId,
  searchQuery = "",
  searchLoading = false,
  connectMode = false,
}: Props) {
  // Two refs: the highlighted row exists in both the desktop table and the
  // mobile card list, but only one is visible at a time. The effect scrolls
  // whichever is actually displayed (offsetParent is null when display:none).
  const desktopRef = useRef<HTMLTableRowElement | null>(null);
  const mobileRef = useRef<HTMLDivElement | null>(null);

  // True once the highlighted row is actually in the rendered set. For a deep
  // row (e.g. #332) the client pages it in progressively, so the row — and its
  // ref — only exist after several pages load; depend on this so the scroll
  // fires THEN, not on the initial (ref-less) mount.
  const highlightPresent = !!highlightEvalId && rows.some((r) => r.id === highlightEvalId);
  useEffect(() => {
    if (!highlightEvalId || !highlightPresent) return;
    const el =
      mobileRef.current?.offsetParent != null
        ? mobileRef.current
        : desktopRef.current;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Re-run when tab changes (row position shifts) or when the row first
    // becomes present (paged in).
  }, [highlightEvalId, tab, highlightPresent]);

  if (rows.length === 0) {
    const q = searchQuery.trim();
    // Search still settling — stay quiet (the parent shows a "Searching…" line)
    // so we don't flash a message before results arrive.
    if (q && searchLoading) return null;
    // Searched, but nobody matched → offer to score that person.
    if (q) {
      return (
        <div className="py-12 text-center">
          <ScoreThemPrompt
            name={q}
            className="text-sm text-zinc-400 leading-relaxed"
          />
        </div>
      );
    }
    // Genuinely empty board (no active search).
    return (
      <p className="text-sm text-zinc-500 italic py-12 text-center">
        {connectMode ? "No one in the directory yet." : "No scored entries yet."}
      </p>
    );
  }

  return (
    <>
      {/* Mobile (<640px): each entry is a card with a 3-up score row. */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((row, i) => {
          const rank = i + 1;
          // "you" label keys off the viewer's CLAIMED eval; the gold highlight +
          // scroll key off either that or the ?e= came-from row.
          const isYou = youEvalId != null && row.id === youEvalId;
          const isHighlighted = row.id === highlightEvalId || isYou;
          const scores = [
            ["founder", "Founder", row.founderScore],
            ["investor", "Investor", row.investorScore],
            ["combined", "Combined", row.combinedScore],
          ] as const;
          return (
            <div
              key={row.id}
              ref={isHighlighted ? mobileRef : undefined}
              className={`flex flex-col gap-3 rounded-lg border p-3 ${
                isHighlighted
                  ? "border-[#dfa43a]/30 bg-[#dfa43a]/[0.07]"
                  : "border-zinc-800"
              }`}
            >
              <div className="flex items-start gap-2">
                {!connectMode && (
                  <span className="w-6 shrink-0 pt-0.5 font-mono text-sm text-zinc-500">
                    {rank}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <NameCell row={row} isMe={isYou} onBadgeFilter={onBadgeFilter} filterableBadgeIds={filterableBadgeIds} />
                </div>
              </div>
              {!connectMode && (
              <div className="grid grid-cols-3 gap-2 border-t border-zinc-800 pt-2.5">
                {scores.map(([col, label, val]) => {
                  const active = col === tab;
                  const status =
                    col === "founder" ? row.founderStatus
                    : col === "investor" ? row.investorStatus
                    : null;
                  return (
                    <div key={col} className="flex flex-col items-center gap-0.5">
                      <span
                        className={`text-[10px] uppercase tracking-[0.15em] ${
                          active ? "text-[#dfa43a]" : "text-zinc-500"
                        }`}
                      >
                        {label}
                      </span>
                      <span
                        className={`font-mono text-lg tabular-nums whitespace-nowrap ${
                          active ? "font-semibold text-zinc-100" : "text-zinc-400"
                        }`}
                      >
                        {val.toLocaleString("en-US")}
                        {(col === "founder" || col === "investor") && (
                          <StatusMarker role={col} status={status} variant="inline" />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop (≥640px). table-fixed so the score columns keep their widths
          and the Name column is BOUNDED to the remaining space — otherwise an
          auto layout lets a long badge row stretch the Name cell and shove the
          Founder/Investor/Combined columns off the right edge. A bounded Name
          cell is also what lets the Badges "fit" expander measure where pills
          wrap and collapse the overflow into "+N more". */}
      <table className="hidden w-full table-fixed border-collapse text-sm sm:table">
        <thead>
          <tr className="text-zinc-500 text-xs uppercase tracking-[0.2em] border-b border-zinc-800">
            <th className="text-left py-3 pr-3 w-12">#</th>
            <th className="text-left py-3 pr-3">Name</th>
            <SortableTh column="founder" label="Founder" thClass="text-right py-3 pr-3 w-24" sort={tab} direction={direction} onSort={onSort} />
            <SortableTh column="investor" label="Investor" thClass="text-right py-3 pr-3 w-24" sort={tab} direction={direction} onSort={onSort} />
            <SortableTh column="combined" label="Combined" thClass="text-right py-3 w-24" sort={tab} direction={direction} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rank = i + 1;
            const isYou = youEvalId != null && row.id === youEvalId;
            const isHighlighted = row.id === highlightEvalId || isYou;
            const isTabScore = (col: "founder" | "investor" | "combined") => col === tab;
            return (
              <tr
                key={row.id}
                ref={isHighlighted ? desktopRef : undefined}
                className={`border-b border-zinc-800 ${isHighlighted ? "bg-[#dfa43a]/[0.07]" : ""}`}
              >
                <td className="py-3 pr-3 font-mono text-zinc-500">{rank}</td>
                <td className="py-3 pr-3">
                  <NameCell row={row} isMe={isYou} onBadgeFilter={onBadgeFilter} filterableBadgeIds={filterableBadgeIds} />
                </td>
                <td
                  className={`py-3 pr-3 text-right font-mono tabular-nums whitespace-nowrap ${
                    isTabScore("founder") ? "text-zinc-100 font-semibold" : "text-zinc-400"
                  }`}
                >
                  {row.founderScore.toLocaleString("en-US")}
                  <StatusMarker role="founder" status={row.founderStatus} variant="inline" />
                </td>
                <td
                  className={`py-3 pr-3 text-right font-mono tabular-nums whitespace-nowrap ${
                    isTabScore("investor") ? "text-zinc-100 font-semibold" : "text-zinc-400"
                  }`}
                >
                  {row.investorScore.toLocaleString("en-US")}
                  <StatusMarker role="investor" status={row.investorStatus} variant="inline" />
                </td>
                <td
                  className={`py-3 text-right font-mono tabular-nums ${
                    isTabScore("combined") ? "text-zinc-100 font-semibold" : "text-zinc-400"
                  }`}
                >
                  {scoreFor(row, "combined").toLocaleString("en-US")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
