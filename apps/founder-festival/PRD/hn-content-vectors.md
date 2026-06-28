## Progress Update as of 2026-06-05 08:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Branch for increment "A" of HN deep enrichment: analyze HN post/comment CONTENT
and route signals to the right credibility vector (technical/traction/domain/gtm)
+ industries, instead of blanket-routing all HN activity to GTM. Also wrote a
durable Chief-integration brainstorm.

### Detail of changes made:
- `docs/superpowers/specs/2026-06-05-chief-integration.md`: durable reference on
  weaving Chief (chief.bot) into Founder Festival — Chief's primitives (chats,
  actions, skills/personas, memories, assets, sessions), ~9 integration ideas,
  the API gaps to expose, and a recommended low-risk starting point.

### Next (this branch):
- HN enricher surfaces a sample of comment/post TEXT to the scoring prompt.
- Rubric: instruct the model to assess individual technical depth/domain/etc from
  the CONTENT and phrase rows so they bucket correctly.
- credibility-vectors.ts: stop blanket-routing "hacker news" → gtm; route by the
  row's content (technical content → technical, etc.), keep raw reach → gtm.

## Progress Update as of 2026-06-05 08:25 PM Pacific

### Increment A built
- `enrichers/hackernews.ts`: fetch + surface a sample of the longest HN comments
  (comment_text; HN hides comment scores so length proxies substance).
- `scoring.ts`: new "HACKER NEWS CONTENT ANALYSIS" block — assess INDIVIDUAL
  technical depth (≤+8) + domain expertise (≤+6) from CONTENT, explicitly distinct
  from credit for founding a technical company (the Collison problem). Conservative.
- `credibility-vectors.ts`: "technical depth" / "domain expertise" rows route by
  substance (technical/domain) BEFORE the generic `hacker news → gtm` rule; raw
  karma/reach stays GTM. +1 attribution test.
- Doc → v0.0.9. tsc clean; 23 credibility + citation tests pass. Takes effect on rescore.

### Still next:
- Industries extraction → canonical_industries column (the industry data layer's
  column + population is its own increment, needs a prod migration).
