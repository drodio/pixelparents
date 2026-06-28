## Progress Update as of 2026-06-05 04:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a **scoring-rubric-doc sync guard** to `.husky/pre-commit` so the rubric
doc stops drifting from the code. When any scoring-logic file is staged
(`src/lib/{scoring,eval-pipeline,credibility-vectors,credibility,badges}.ts` or
`src/lib/enrichers/*`), the hook now blocks the commit unless
`PRD/scoring-rubric-v0.0.1.md` is also staged — forcing a re-read + update (or an
explicit "verified accurate" changelog line). Mirrors the existing per-branch PRD
guard pattern.

### Detail of changes made:
- `.husky/pre-commit`: new guard inserted between the PRD-log guard and the
  schema-drift guard. Same "do NOT bypass with --no-verify" stance.

### Potential concerns to address:
- The guard forces a doc touch on every scoring-logic commit, even trivial ones
  (e.g. a comment fix) — intentional friction to prevent drift; the "verified
  accurate as of <date>" escape keeps it honest without a real edit being faked.

## Progress Update as of 2026-06-05 04:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Technical-depth recalibration (rubric v0.0.8), split onto its own branch off the
latest main (the leaderboard work lives on `worktree-scoring-rubric` / PR #178).
Diagnosed from 4 public profiles: non-technical founders (DROdio) hit the
92nd-percentile Technical Depth radar vector almost entirely on "old GitHub
account + one recent push," while a truly technical founder (Geoff Schmidt —
Meteor + Apollo) only scored 83rd because his OSS lives in company orgs the
personal-account GitHub enricher never sees. Fix: de-weight presence/age, boost
impact, and add a deterministic company-flagship OSS bonus for founders.

### Detail of changes made:
- **`scoring.ts`** — GitHub builder sub-rules: identity +3→+2, tenure/age +3→+1;
  recency bonus **gated on real building** (full +15 only for a "substantial
  builder" = a ≥500★ repo or ≥10 non-fork repos; else +3 / +2). Boosted impact:
  top-repo curve `20× → 25× log10(stars)` (100★→+50 … 100k→+125), additional
  1k★ repos +15/max2 → +20/max3, new 20k+ followers → +20 tier. Added an
  "IMPACT, not presence" principle + instruction NOT to award the company-org
  flagship (handled in code). New exported `githubTopRepoPoints(stars)`.
- **`enrichers/github.ts`** — `orgLoginFromDomain()` + `companyOrgTopRepo(domain)`
  (GitHub search API; best-effort, null on miss/rate-limit).
- **`eval-pipeline.ts`** — `addCompanyGithubBonus()` mirrors `addCompanyMmBonus`:
  deterministic, post-scoring, keyed on resolved `primaryCompanyDomain`; credits
  founders for their company org's flagship OSS on the uncapped star curve as a
  `github_top_repo` row (github.com source → Technical Depth vector).
- **Doc → v0.0.8** (`PRD/scoring-rubric-v0.0.1.md`): rewrote GitHub sub-rules,
  added a "Company-flagship OSS bonus" section + a "How a technical founder earns
  points" summary with the calibration-target table.
- **Tests** (`tests/lib/github-company-oss.test.ts`): curve, `orgLoginFromDomain`,
  `companyOrgTopRepo`. tsc clean, prod build green.

### Potential concerns to address:
- **Calibration not yet verified on prod** — the new rubric only affects NEW
  scores; the 4 targets (ideally the whole pool) must be rescored after deploy to
  read the new percentiles. Targets: DROdio→~60th, Geoff→low-90s, Max/Mitchell→~100.
- **`addCompanyGithubBonus` adds 1 GitHub *search* call per founder eval** on the
  post-LLM path (30/min with prod token); a bulk `rescore-all` could exceed it and
  silently skip the bonus (degrades to null). Cache org→top-repo if that matters.
- HN Tokenmaxxing as a high-fidelity technical signal + a hook improvement to keep
  the rubric doc in sync are the next asks (Sam Odio calibration).
