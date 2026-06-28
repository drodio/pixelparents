## Progress Update as of 2026-06-05 10:48 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two scoring-progress (waterfall) fixes: (1) revert the green-check step rows to white — only the sub-bullet findings should be gold (I'd over-applied gold to the main rows); (2) turn "Computing your score" into a gold left-to-right progress bar at the top of the scoreboard header instead of a spinner/step, so there's always movement while the score computes.

### Detail of changes made:
- `src/components/EvalProgress.tsx`:
  - Step rows: reverted to white — done `text-zinc-300`, active `text-white`, pending `text-zinc-600`. The revealed sub-bullet findings stay gold (`text-[#dfa43a]`, already on main). Score numbers (Founder/Investor/Total) stay gold.
  - New `scoreComputing = completed >= steps.length - 1`. The sticky scoreboard header is now `relative` with a top track (`absolute inset-x-0 top-0 h-1 bg-zinc-800`) whose gold fill (`bg-[#dfa43a]`) animates `width: 0% → 92%` over a 20s linear CSS transition once `scoreComputing` flips. Estimated; capped at 92% so it doesn't look "done"; navigation can happen before it's full (fine, the component unmounts).
  - The parked final research step renders as a green check (not a spinner) during `scoreComputing` — the top bar is the live indicator now.
  - Removed the bottom "Finalizing your profile…" spinner (the bar replaces it).
- `src/lib/eval-steps.ts`: removed "Computing your score" from `EVAL_STEPS` (it's the top bar now). `mapFindingToStep`'s fallback (`EVAL_STEPS.length - 1`) now points at "Synthesizing…", which is fine.
- `docs/coordination/leaderboard.md`: updated the cross-surface note (these are the scoring agent's files).

### Verification:
- `tsc --noEmit` clean; eslint clean on `EvalProgress.tsx` + `eval-steps.ts`.
- The waterfall (`EvalProgress`) is a transient, live-only view (only shows during an actual score/rescore run), so the bar + colors are verified by code review, not a headless capture. A live eval on dev is costly/flaky (needs enricher API keys), so deferred to the user's next score.

### Potential concerns to address:
- Bar timing is a rough 20s estimate. If real compute regularly exceeds ~20s the bar will sit near 92% (still some movement from sub-bullets folding in); if it's much faster the bar shows only briefly. Tune `width`/duration if it reads wrong.
- These are the scoring agent's files (`EvalProgress.tsx`, `eval-steps.ts`); rebased before shipping, but watch for collisions if they're iterating the same component.
- The other agent reports `canonical_industries` + `industry=<slug>` filter are now live on main — industry can graduate to Option B (sidebar counts + click-to-filter) as a separate follow-up.
