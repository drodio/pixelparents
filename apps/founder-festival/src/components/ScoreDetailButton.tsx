"use client";

import { useState } from "react";
import { ScoreDetail, type ScoreDetailData, type RecommendationsData } from "./ScoreDetail";

// Thin trigger around the presentational <ScoreDetail/>. Kept for the
// localhost-only debug affordance on /not-this-round and the /admin/profiles
// "Score Detail" deep-link (?debug=1 → autoOpen). The profile page's admin pill
// uses <ScoringLogButton/> instead, which shows the full run history.

type Props = ScoreDetailData & {
  // Open the modal immediately on mount (e.g. arriving from the /admin/profiles
  // "Score Detail" link with ?debug=1).
  autoOpen?: boolean;
};

export type { RecommendationsData };

export function ScoreDetailButton({ autoOpen, ...data }: Props) {
  const [open, setOpen] = useState(autoOpen ?? false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200 transition-colors"
      >
        Score Detail
      </button>
      {open && <ScoreDetail data={data} onClose={() => setOpen(false)} />}
    </>
  );
}
