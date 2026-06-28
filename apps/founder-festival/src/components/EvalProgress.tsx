"use client";

import { useEffect, useRef, useState } from "react";
import type { TallyItem } from "@/lib/eval-steps";

type Props = {
  steps: string[];
  // True once the underlying async work has finished. The component will hold
  // a spinner on the final research step until this flips true.
  done: boolean;
  onAllDone: () => void;
  // Data-driven "tally" items (built from the actual scoring breakdown) played
  // AFTER `done`, at a readable pace, instead of sitting on the final step. As
  // they fold in, a founder/investor/total scoreboard ticks up to the real
  // score. Empty/undefined → behaves exactly as the plain step list.
  finale?: TallyItem[];
};

// Research steps pace at ~1.7–3.0s each so they keep ticking through a typical
// 30–45s fresh run instead of freezing on the last step; the post-result tally
// is readable; remaining research steps snap once the API is back.
const RESEARCH_MIN_MS = 1700;
const RESEARCH_JITTER_MS = 1300;
const SNAP_MS = 180;
const TALLY_MS = 850;
// Linger on the completed scoreboard so the final Founder/Investor/Total is
// clearly seen before navigating to the results page.
const DWELL_MS = 2400;

export function EvalProgress({ steps, done, onAllDone, finale = [] }: Props) {
  const [completed, setCompleted] = useState(0);
  const firedRef = useRef(false);
  const activeRef = useRef<HTMLLIElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const scrolledTopRef = useRef(false);

  const allSteps = finale.length > 0 ? [...steps, ...finale.map((f) => f.text)] : steps;
  // Hold the spinner on the last RESEARCH step until the API returns.
  const holdIndex = steps.length - 1;

  // Live scoreboard: sum the finale items that have folded in so far. An item
  // counts once the active line reaches it (global index = steps.length + j),
  // so founder/investor/total tick up to the real score as lines reveal.
  let founderPts = 0;
  let investorPts = 0;
  finale.forEach((it, j) => {
    if (completed >= steps.length + j) {
      if (it.rubric === "founder") founderPts += it.points;
      else investorPts += it.points;
    }
  });
  // Show the Founder/Investor/Total scoreboard from the very beginning of the
  // run (starting at 0/0/0) so it's a stable anchor; it ticks up as the finale
  // rows fold in. Only suppressed when this instance has no finale at all
  // (plain step list with no scoring, e.g. non-scoring usages).
  const showScoreboard = finale.length > 0 || !done;
  // "Computing your score" phase: once the research steps are all checked, the
  // top progress bar fills left→right (estimated) so there's always movement
  // instead of a spinner. It's fine if the score lands before the bar is full.
  const scoreComputing = completed >= steps.length - 1;
  // Gold-bullet phase: research is done and we're folding the scored findings in
  // and driving the score up. We pin the view to the TOP here (see the scroll
  // effect) and show a gold "Scoring…" spinner line above the first step.
  const inTally = finale.length > 0 && completed >= steps.length;

  // Findings revealed so far (phase 2), grouped under the step that produced them.
  // Each finale item carries a stepIndex (see mapFindingToStep); we render the
  // revealed ones as sub-bullets beneath their parent step instead of as their
  // own rows. gidx is the global reveal order so we can flag the latest one.
  const revealedFindings = Math.max(0, completed - steps.length);
  const findingsByStep = new Map<number, Array<{ item: TallyItem; gidx: number }>>();
  for (let j = 0; j < revealedFindings; j++) {
    const item = finale[j]!;
    const arr = findingsByStep.get(item.stepIndex) ?? [];
    arr.push({ item, gidx: j });
    findingsByStep.set(item.stepIndex, arr);
  }

  useEffect(() => {
    if (firedRef.current) return;
    if (completed >= allSteps.length) return;
    // Hold on the last research step until the API actually returns.
    if (completed === holdIndex && !done) return;
    const inFinale = completed >= steps.length;
    const delay = inFinale ? TALLY_MS : done ? SNAP_MS : RESEARCH_MIN_MS + Math.floor(Math.random() * RESEARCH_JITTER_MS);
    const id = setTimeout(() => setCompleted((c) => c + 1), delay);
    return () => clearTimeout(id);
  }, [completed, done, allSteps.length, steps.length, holdIndex]);

  useEffect(() => {
    if (completed < allSteps.length || firedRef.current) return;
    firedRef.current = true;
    // Dwell on the final scoreboard before navigating (skip the dwell when
    // there's no tally to show, e.g. low-signal).
    const id = setTimeout(onAllDone, finale.length > 0 ? DWELL_MS : 0);
    return () => clearTimeout(id);
  }, [completed, allSteps.length, onAllDone, finale.length]);

  // Scroll behavior, in two phases:
  //  • Research phase (white checkmarks): auto-scroll DOWN to keep the active
  //    step in view as the list grows (block: "nearest" so it only moves when the
  //    line is actually off-screen).
  //  • Gold-bullet phase (folding findings in, score driving up): scroll back to
  //    the TOP exactly ONCE, then leave it — no per-finding scrolling. This stops
  //    the page from jumping up and down so the user can scroll freely to watch.
  useEffect(() => {
    if (inTally) {
      if (!scrolledTopRef.current) {
        scrolledTopRef.current = true;
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [completed, inTally]);

  return (
    // text-left guards against an ancestor's text-center (the re-score modal is
    // rendered inside the profile page's .text-center subtree): without this the
    // steps + finale tally inherit centering and wrapped lines look centered.
    <div className="text-left" ref={topRef}>
      {showScoreboard && (
        <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-4 px-5 pt-5 pb-3 bg-black border-b border-zinc-800 relative">
          {/* "Computing your score" progress bar across the top, above the score
              numbers + divider. Fills left→right over an estimate once the
              research steps are checked (scoreComputing) — constant movement,
              no spinner. It may not reach 100% before the score lands; that's
              fine (we navigate away). Capped at 92% so it doesn't sit "full"
              looking done while we're still finalizing. */}
          <div className="absolute inset-x-0 top-0 h-1 bg-zinc-800" aria-hidden>
            <div
              className="h-full bg-[#dfa43a]"
              style={{
                width: scoreComputing ? "92%" : "0%",
                transition: "width 20000ms linear",
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <ScoreStat label="Founder" value={founderPts} />
              <ScoreStat label="Investor" value={investorPts} />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-px bg-zinc-700" aria-hidden />
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Total</span>
                <span className="font-display text-3xl font-bold tabular-nums leading-none text-[#dfa43a]">
                  {founderPts + investorPts}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Async-enrichment note, below the gold scoreboard line. Sets the
          expectation that the score keeps improving after the splash, as the
          BrightData sweep (Crunchbase, LinkedIn company, …) folds in over the hour. */}
      {showScoreboard && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-[#dfa43a]/30 bg-[#dfa43a]/5 px-3 py-2 text-xs text-zinc-400">
          <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#dfa43a]" fill="currentColor" aria-hidden>
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.9.9 0 1 1 0 1.8A.9.9 0 0 1 8 4zm1 8H7a.6.6 0 0 1 0-1.2h.4V7.8H7a.6.6 0 0 1 0-1.2h1.4v4.2H9a.6.6 0 0 1 0 1.2z" />
          </svg>
          <span>
            This profile will continue to be scored asynchronously using Crunchbase and other data sets over the next hour.
          </span>
        </div>
      )}
      {/* Gold "Scoring…" line — starts the moment the gold progress bar begins
          to fill (scoreComputing), not one step later when findings fold in, so
          the spinner and the bar move together. Spinner sits where the green
          checkmark goes for the white steps; gold text mirrors the research-step
          styling. */}
      {scoreComputing && finale.length > 0 && (
        <div className="flex items-start gap-3 mb-3 text-sm">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center">
            <GoldSpinner />
          </span>
          <span className="text-[#dfa43a] font-medium">
            Scoring your profile based on agent results
          </span>
        </div>
      )}
      <ul className="flex flex-col gap-3" aria-live="polite">
      {steps.map((label, i) => {
        const raw = i < completed ? "done" : i === completed ? "active" : "pending";
        // During the "computing your score" phase, show the parked final step as
        // done (green check) — the top progress bar is the live indicator now, so
        // we don't leave a spinner sitting on the last research step.
        const state = scoreComputing && i === steps.length - 1 ? "done" : raw;
        const findings = findingsByStep.get(i) ?? [];
        return (
          <li
            key={`${i}-${label}`}
            ref={i === completed ? activeRef : null}
            className="flex flex-col gap-2 text-sm"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center">
                {state === "done" ? <CheckIcon /> : state === "active" ? <Spinner /> : <Dot />}
              </span>
              <span
                className={
                  state === "done"
                    ? "text-zinc-300"
                    : state === "active"
                      ? "text-white"
                      : "text-zinc-600"
                }
              >
                {label}
              </span>
            </div>
            {findings.length > 0 && (
              <ul className="ml-8 flex flex-col gap-1.5">
                {findings.map(({ item, gidx }) => (
                  <li
                    key={gidx}
                    className="flex items-start gap-2 text-sm text-[#dfa43a]"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#dfa43a]" aria-hidden />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
      </ul>
    </div>
  );
}

function ScoreStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      <span className="font-display text-xl font-bold tabular-nums leading-none text-[#dfa43a]">{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 rounded-full border-2 border-zinc-700 border-t-white animate-spin"
      aria-hidden
    />
  );
}

function GoldSpinner() {
  return (
    <span
      className="h-4 w-4 rounded-full border-2 border-zinc-700 border-t-[#dfa43a] animate-spin"
      aria-hidden
    />
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 text-emerald-400" aria-hidden>
      <path
        fill="currentColor"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4L8.5 12l6.8-6.7a1 1 0 0 1 1.4 0z"
      />
    </svg>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" aria-hidden />;
}
