# Better technical-prowess signal — open questions for the operator

You asked: *"Right now we're giving somebody a lot of technical points if
they have had a GitHub account for a long time period but just because
they've had a GitHub account doesn't mean they're super technical. Do we
have any visibility into how much code they've actually shipped that we
can layer into this signal or what other ways could we really do a better
job of gauging technical prowess? Related: could we look for personal
blogs where developers are making technical posts?"*

## What I shipped on this branch (no decision needed)

`feat(scoring): dev.to as a structured technical-writing enricher` — see
the PR description for details. **High-confidence, additive, $0 cost**:

- New `src/lib/enrichers/devto.ts` — identity-confirmed (GitHub handle or
  cross-platform handle match or strong name overlap), pulls articles +
  tag list + reactions + comments + most-recent-published.
- Distinguishes **technical** articles from career/productivity posts via
  a curated tag whitelist (typescript, postgres, kubernetes, llm, etc.).
- New rubric section in `scoring.ts`:
  - +2 for confirmed dev.to presence (modest — even one published post
    is non-zero effort)
  - +6 for **sustained technical writer** (≥5 technical articles)
  - +6 for **high-impact article** (top article has ≥200 reactions)
  - +4 for **active in the last 12 months**
  - Cap +18 total from the [devto] section. Rules stack because each
    rewards a different facet.
- Citation domains for `dev.to` and `hashnode.com` map to the **technical**
  vector on the radar (so dev.to evidence contributes to the right axis).

This already partially addresses your concern: when someone HAS published
technical writing, they get up to **+18** points in the technical/builder
bucket that don't depend on GitHub account age.

## What I have lower confidence on — your call

### 1. Should we tighten the "GitHub account ≥5 years tenured = +3" rule?

The existing rubric awards `+3 once` for an account ≥5 years old. The
recency rules elsewhere can *also* fire (+15 / +8 / -8 / -15 based on
most-recent push). But "+3 for being old" pads the score for accounts
that have been dormant for years, which is exactly your complaint.

Three options:

- **A. Leave alone.** +3 is small; the dormant penalty (-15) already
  punishes the bad case.
- **B. Require tenure + recent activity.** Change to "Tenured account
  (≥5 years AND most-recent push within the last 12 months): +3 once."
  Idle accounts no longer get the bonus.
- **C. Drop tenure entirely.** It's a presence signal, not a prowess
  signal — let recency carry the message.

My instinct is **B**, but it shifts scores on real profiles and would
benefit from your call.

### 2. Personal-blog detection — how aggressive should the matcher be?

Beyond dev.to / Hashnode, technical writing lives on personal sites
(Substack, GitHub Pages, Mintlify, Hugo, Astro, Hashnode-custom-domain,
plain WordPress). Detecting these reliably is harder:

- **Easy(-ish):** if the LinkedIn page or Exa highlights contain a URL
  pointing at a personal domain (`*.dev`, `*.io`, `*.me`, etc.), fetch
  its `/feed.xml` / `/rss.xml` / `/feed.json`. If it exists and has ≥3
  technical-titled posts, count it.
- **Harder:** distinguish "tech blog" from "general blog." The cheap
  proxy: post titles contain at least one keyword from a list
  (algorithm, kubernetes, debugging, optimization, etc.) OR the site
  links to GitHub from the homepage.
- **Hardest:** Substack tech blogs (Stratechery-shape essays about
  software vs an engineering deep-dive). Probably needs an LLM judgment
  call per blog, which adds cost.

**Question:** How willing are you to trade precision for recall here?
And: do you want to spend Exa / Claude on judging "is this blog
technical" for each unmatched author, or keep this pattern-based?

### 3. Substack + Medium feasibility

- **Substack:** Free RSS at `https://<sub>.substack.com/feed`. Detect
  technical via title-keyword heuristic OR LLM judgment. Cost: one
  fetch per detected substack URL.
- **Medium:** has an undocumented RSS at `https://medium.com/@user/feed`
  but rate-limited / scraping-flavored. Risk: hits 403/429 at any
  moment.
- **Mirror:** small but heavily technical-leaning blog platform.
  Free API. Low traffic, low payoff.

**Question:** Are you OK with adding RSS-fetch dependencies for these?
Worth the surface area or skip?

### 4. Hashnode

I have a Hashnode GraphQL probe ready — they expose the same shape as
dev.to (posts, tags, reactions). My initial test users returned empty,
so I didn't ship it in this PR. Three questions:

- Want me to add Hashnode in a follow-up?
- Or wait and see if it's worth it once we have some dev.to ground
  truth?

### 5. GitHub code-volume beyond `pushed_in_last_365d`

The current GitHub enricher already returns `pushed_in_last_90d` and
`pushed_in_last_365d` (counts of **repos** with a push in that window).
This is a coarse signal — pushing a typo fix to a README counts the same
as pushing a 500-LOC refactor.

Deeper signals available, with cost trade-offs:

- **Contribution count** (the green-squares calendar number) —
  available via the GitHub GraphQL `contributionsCollection` query. 1
  call per subject. Higher-fidelity, well-known signal. **Recommended.**
- **Lines-of-code shipped** in the last 12 months across owned repos —
  GitHub's `repo/stats/contributors` endpoint. Expensive (one call per
  repo + GH may 202 you for 30s), and noisy (a generated lockfile
  commit can be 50k LOC).
- **PRs MERGED to repos they don't own** — strong "ships code in
  the open" signal. GitHub search API. Subject to rate limits.
- **Code-review count** — they've reviewed N PRs across repos. Strong
  but requires deeper GraphQL queries.

**Question:** want me to add the contributionsCollection signal in a
follow-up? It's the single most-direct "how much code did they ship"
metric and the API is cheap.

### 6. What does "technical prowess" mean to you, score-wise?

Right now Claude reads "TIER 1 ENRICHMENT SOURCES" facts + the rubric
sub-rules and assembles a score. There's no separate `technicalScore`
that we surface — it's all rolled into the founder score (plus the
radar's `technical` axis).

Two product directions worth considering:

- **Make "Technical" a first-class score** alongside Founder / Investor.
  This would surface "Top 10% Technical" as a leaderboard view and let
  recruiters / VCs filter on it explicitly. Big lift.
- **Keep it as a radar vector but surface it more.** E.g., a "Technical:
  93rd percentile" badge or a small breakdown on the profile page.
  Smaller lift.

**Question:** is technical prowess a *dimension* of the existing
founder/investor view, or a separate identity worth ranking on its own?

## Suggested next step

If you're back at the keyboard and want to keep moving without writing a
long reply, answer **just Q1 and Q5** above (the two highest-leverage,
lowest-debate choices) — I'll ship those next. The rest can wait.
