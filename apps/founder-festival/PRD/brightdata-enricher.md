## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Added BrightData as a Tier-1 enricher. Pulls a structured LinkedIn profile BY URL (identity is exact — no same-name risk) surfacing reach/activity/experience/education/certs/languages the Exa/EnrichLayer text path misses. LinkedIn follower count is now scored DETERMINISTICALLY at 1 point per 1,000 followers (DROdio: 27,680 → +27 founder points). New waterfall line "Enhancing your profile with Bright Data". Verified live against /drodio and Patrick Collison.

### Detail of changes made:
- `src/lib/brightdata.ts` (new): BrightData Web Scraper API client — trigger→poll→download (datasets LinkedIn `gd_l1viktl72bvl7bjuj0`, Crunchbase `gd_l1vijqt9jfj7olije`). Best-effort, bounded wait.
- `src/lib/enrichers/brightdata.ts` (new): `enrichWithBrightData(ctx)` — fetches LinkedIn by ctx.linkedinUrl, builds facts (followers w/ "system-scored" note, current company, experience roles, education, awards, certs, languages, recent activity). Empty on no key / no profile / timeout.
- `src/lib/enrichers/index.ts`: registered with `timeoutMs: 22_000` (async collect needs > 15s default). `src/lib/enrichers/types.ts`: added `"brightdata"` source.
- `src/lib/eval-pipeline.ts`: `addLinkedinFollowersBonus()` — deterministic founder row = floor(followers/1000) from the brightdata enrichment's exact count; called in `scoreInputs` before clamp/weighting. verification="authoritative" so it doesn't drift on re-score.
- `src/lib/eval-steps.ts`: new EVAL_STEPS line + HOST_TO_STEP maps `linkedin.com` → "Looking you up on LinkedIn" and `crunchbase.com` → "Bright Data" so points-adding findings fold in as gold bullets under the right step.
- `src/lib/scoring-rubric.ts`: instruct the model NOT to award follower points (system scores them) — avoids double-count.

### Fidelity findings (live test):
- LinkedIn (BrightData) fidelity is profile-dependent: Patrick Collison returned full experience (CEO @ Stripe, Arc Institute, Auctomatic) + 734-char about; DROdio returned 0 experience roles + 83-char about (only the logged-out public view is scrapable). Both returned accurate followers/activity/languages.
- Crunchbase (BrightData) is the high-value source: Socialcast → acquired_by VMware; Stripe → employee bands/founders/investors; Chief → seed funding + AI industries. Also web traffic, app downloads, exits, growth scores. NOT yet wired (needs company-URL discovery — follow-up).

### Potential concerns to address:
- Latency/cost: BrightData runs on EVERY eval now (key present in prod). Adds ~7–22s (async collect) + ~$0.0025/eval. Follow-up: cache the raw LinkedIn record on the evaluation so re-scores are instant + free, and/or trigger collection early (overlap with Exa research).
- Followers row caps at MAX_POINTS_PER_ITEM=200 (i.e. 200k+ followers → 200 pts); never bites for normal ranges. Exempt via a rule id if uncapped reach is wanted.
- Crunchbase enricher pending: needs reliable founder→company Crunchbase-slug resolution (same linking challenge as identity corroboration).
