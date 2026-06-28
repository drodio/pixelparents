"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { Avatar } from "@/components/Avatar";
import { Badges } from "@/components/Badges";
import { displayName } from "@/components/LeaderboardTable";

// A mini leaderboard-style table of profiles (name gold + company, badges,
// founder/investor/combined scores). Shared by the event Attendees table and the
// per-sponsor/host people tables so they look identical. Claimed viewers see full
// data and rows link to the profile; unclaimed viewers see it blurred and rows
// link to claim/score (/?find=1). `defaultShown` enables a "Load more" cap (omit
// to show all). `unmatchedNames` renders score-less rows for people with no
// profile. `rowAction` adds a trailing per-row control (e.g. a Connect button);
// when present the row is no longer a whole-row link — the name links instead.
export function ProfileMiniTable({
  rows,
  isClaimed,
  unmatchedNames = [],
  defaultShown,
  blurUnclaimed = true,
  rowAction,
}: {
  rows: LeaderboardRow[];
  isClaimed: boolean;
  unmatchedNames?: string[];
  defaultShown?: number;
  blurUnclaimed?: boolean;
  rowAction?: (row: LeaderboardRow) => ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);

  const items: ({ kind: "row"; row: LeaderboardRow } | { kind: "unmatched"; name: string })[] = [
    ...rows.map((row) => ({ kind: "row" as const, row })),
    ...unmatchedNames.map((name) => ({ kind: "unmatched" as const, name })),
  ];
  if (items.length === 0) return null;

  const limit = defaultShown ?? Infinity;
  const shown = showAll ? items : items.slice(0, limit);
  // Reveal when the viewer is claimed OR this table never blurs (sponsors/hosts).
  const reveal = isClaimed || !blurUnclaimed;
  const blur = reveal ? "" : "blur-sm select-none";
  const hasAction = !!rowAction;
  const cols = hasAction
    ? // Action column is a FIXED width (not auto) so a short cell like "You"
      // doesn't let the name column expand and shove the score columns out of
      // line with the Connect-button rows.
      "grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_3rem_6rem] sm:grid-cols-[minmax(0,1fr)_4rem_4rem_5rem_7rem] items-center gap-2 sm:gap-3 px-3"
    : "grid grid-cols-[minmax(0,1fr)_3rem_3rem_3.5rem] sm:grid-cols-[minmax(0,1fr)_4rem_4rem_5rem] items-center gap-2 sm:gap-3 px-3";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-zinc-800 rounded-lg border border-zinc-800 overflow-hidden">
        <div className={`${cols} py-2 text-[10px] uppercase tracking-wide text-zinc-500`}>
          <span>Name</span>
          <span className="text-right">Founder</span>
          <span className="text-right">Investor</span>
          <span className="text-right">Combined</span>
          {hasAction && <span className="text-right">Connect</span>}
        </div>

        {shown.map((it, i) => {
          if (it.kind === "unmatched") {
            return (
              <div key={`u-${i}`} className={`${cols} py-2.5`}>
                <span className={`truncate text-sm text-zinc-300 ${blur}`}>{it.name}</span>
                <span className="text-right font-mono text-sm text-zinc-600">—</span>
                <span className="text-right font-mono text-sm text-zinc-600">—</span>
                <span className="text-right font-mono text-sm text-zinc-600">—</span>
                {hasAction && <span />}
              </div>
            );
          }
          const r = it.row;
          const nameLine = (
            <span className={`block truncate text-sm font-bold text-[#dfa43a] ${blur}`}>
              {hasAction && reveal ? (
                <a href={r.profileHref} className="hover:underline">
                  {displayName(r)}
                </a>
              ) : (
                displayName(r)
              )}
              {r.companyName && <span className="font-normal text-zinc-400">, {r.companyName}</span>}
            </span>
          );
          const body = (
            <>
              <span className="flex min-w-0 items-start gap-2">
                <span className={`shrink-0 ${blur}`}>
                  <Avatar imageUrl={r.claimedImageUrl} name={displayName(r)} size="sm" />
                </span>
                {/* flex-1 + min-w-0 so this block fills (and is bounded by) the
                    name column — the Badges "fit" expander measures THIS width to
                    collapse overflow into "+N more". A block (not inline-flex)
                    badge container is required for that measurement. */}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {nameLine}
                  {r.badges.length > 0 && (
                    <span className={`block ${blur}`}>
                      <Badges badges={r.badges} layout="fit" size="xs" />
                    </span>
                  )}
                </span>
              </span>
              <span className="text-right font-mono text-sm tabular-nums text-zinc-400">
                {r.founderScore.toLocaleString("en-US")}
              </span>
              <span className="text-right font-mono text-sm tabular-nums text-zinc-400">
                {r.investorScore.toLocaleString("en-US")}
              </span>
              <span className="text-right font-mono text-sm font-semibold tabular-nums text-zinc-100">
                {r.combinedScore.toLocaleString("en-US")}
              </span>
              {hasAction && <span className="flex justify-end">{rowAction!(r)}</span>}
            </>
          );
          return hasAction ? (
            <div key={r.id} className={`${cols} py-2.5`}>
              {body}
            </div>
          ) : (
            <Link
              key={r.id}
              href={reveal ? r.profileHref : "/?find=1"}
              className={`${cols} py-2.5 transition-colors hover:bg-zinc-900/60`}
            >
              {body}
            </Link>
          );
        })}
      </div>

      {Number.isFinite(limit) && items.length > limit && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="self-center rounded-md border border-zinc-700 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Load more ({items.length - limit} more)
        </button>
      )}
    </div>
  );
}
