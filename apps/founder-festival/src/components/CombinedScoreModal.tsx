"use client";

import { useState } from "react";

export type ScoreLine = { reason: string; points: number };

// The big combined score, made clickable. Clicking opens a modal anchored to
// the right of the screen showing the full score "waterfall" — every founder /
// investor line item and its points. Empty dimensions are omitted.
export function CombinedScoreModal({
  score,
  founder,
  investor,
  scoreClassName,
}: {
  score: number;
  founder: ScoreLine[];
  investor: ScoreLine[];
  scoreClassName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="See the score breakdown"
        className={`${scoreClassName} cursor-pointer transition-colors hover:text-[#dfa43a]`}
      >
        {score.toLocaleString("en-US")}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-stretch justify-end bg-black/60 p-3 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Score breakdown"
            className="flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-zinc-700 bg-[#161616] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Combined Score</p>
                <p className="font-display text-2xl font-bold tabular-nums text-[#dfa43a]">
                  {score.toLocaleString("en-US")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-2xl leading-none text-zinc-400 hover:text-white"
              >
                ×
              </button>
            </header>
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
              {founder.length > 0 && <Dimension title="Founder score" lines={founder} />}
              {investor.length > 0 && <Dimension title="Investor score" lines={investor} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Dimension({ title, lines }: { title: string; lines: ScoreLine[] }) {
  const total = lines.reduce((s, l) => s + l.points, 0);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-zinc-100">{title}</h3>
        <span className="font-display text-lg font-bold tabular-nums text-[#dfa43a]">
          {total.toLocaleString("en-US")}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-zinc-300">{l.reason}</span>
            <span
              className={`shrink-0 font-semibold tabular-nums ${
                l.points >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {l.points >= 0 ? "+" : ""}
              {l.points.toLocaleString("en-US")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
