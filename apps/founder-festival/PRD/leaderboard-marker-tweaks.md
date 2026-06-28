## Progress Update as of 2026-06-05 10:12 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Four small presentational fixes from product requests: (1) profile status checkmark now sits to the RIGHT of the score number instead of wrapping below; (2) the score/rescore progress page's Founder/Investor/Total numbers are gold; (3) its step bullet labels are gold (were white); (4) the progress list no longer bounces the viewport — it fills top-to-bottom.

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx`: added `whitespace-nowrap` to the Founder + Investor score-number spans so the `StatusMarker` (✓/✱) stays inline to the right of the number. It was wrapping below for wide numbers (e.g. "77,906"); short numbers happened to fit. Verified on a dev profile (336 ✓ / 52 ✓ both inline-right).
- `src/components/EvalProgress.tsx`:
  - Founder/Investor (`ScoreStat`) + Total numbers: `text-white` → `text-[#dfa43a]` (gold).
  - Step labels: done `text-zinc-300` → `text-[#dfa43a]`, active `text-white` → `text-[#dfa43a] font-medium`; pending stays `text-zinc-600` (dim, not-yet-reached). So completed/active steps read gold, pending stays dim for progress legibility.
  - `scrollIntoView` `block: "center"` → `"nearest"` in all three branches (active step / latest finding / finalizing). The steps already complete sequentially; the bounce was the viewport re-centering on every step + revealed finding. "nearest" only scrolls when off-screen and only as far as needed → top-to-bottom fill, no yank.
- `docs/coordination/leaderboard.md`: noted these cross-surface tweaks (they're in the scoring agent's files — `FounderStatusMarker.tsx` darker-red from the prior PR, plus `profile/page.tsx` + `EvalProgress.tsx` here) so we don't collide.

### Verification:
- `tsc --noEmit` clean; eslint clean on `EvalProgress.tsx` (the 2 errors on `profile/page.tsx` are the pre-existing header `<a>`/`<img>`, not these edits).
- Profile marker: headless Chrome screenshot of a dev profile confirms the founder + investor checks render inline to the right of the numbers, percentile below, no layout break.
- EvalProgress gold + no-jump: verified by code review — the live progress UI is transient (only shows during a score/rescore run), so it wasn't browser-captured. Changes are pure class swaps + a standard `block:"nearest"` scroll fix.

### Potential concerns to address:
- These edits are in the scoring agent's surface (profile score block + `EvalProgress`); rebased onto latest main before shipping, but watch for follow-on collisions if they're iterating the eval-progress UX.
- EvalProgress "jump" fix targets the viewport-recenter (the dominant cause). If revealed-finding sub-bullets inserting under earlier steps still cause minor reflow, a follow-up could reveal findings in step order — deferred unless it still reads as jumpy.
