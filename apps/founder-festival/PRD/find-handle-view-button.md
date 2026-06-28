# Branch: `find-handle-view-button` — progress log

Branched from `main` (post PR #57).

## Progress Update as of 2026-05-26 2:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two follow-ups from QA on the "Peter Cho Crunchbase" search, which
returned wrong people and missed the correct profile
(linkedin.com/in/peter--cho):

**1. Search accuracy — switched to Exa's people-entity index.**
Debugged directly against Exa 2.13 and found:
- `category: "people"` has FAR better recall of same-name LinkedIn
  profiles than a plain web search.
- Pinning `includeDomains: ["linkedin.com"]` *hurts* recall under
  category:people — it dropped the correct profile. Removed it;
  non-LinkedIn results are filtered out downstream by extractHandle.
- `includeText: [company]` is useless on LinkedIn: pages are
  login-gated so Exa's crawled text is sparse, and the filter removed
  essentially everything (0 results). Removed.
- Dropped the hardcoded "founder profile" suffix — it biased ranking
  toward founders and buried GTM/eng/etc. profiles. Company is now a
  soft term in the query string, with a name-only retry if it yields
  nothing.
Result: "Peter Cho" + "Crunchbase" now returns `peter--cho` as the
#1 candidate (verified live against the API on :3004). Brian Chesky
+ Airbnb → brianchesky #1.

**2. Show name + headline + handle.** FoundCandidate now carries
`name` and `headline`. The title ("Peter Cho - GTM @ Crunchbase | …")
is parsed into name + headline; when the title is a bare name, the
headline is derived from the crawled page text (markdown links
stripped, name-header / "N connections" / location lines skipped).
The result row renders name (bold) → headline (gray, 2-line clamp) →
handle (dim).

Files: `src/lib/find-linkedin-handle.ts` (rewrite of the search +
title/headline parsing), `src/components/FindHandleHelper.tsx`
(render name/headline/handle).

---

## Progress Update as of 2026-05-26 2:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
"Help me find my LinkedIn handle" (FindHandleHelper) listed each
candidate as a single full-width button that picks the handle on
click. Users had no way to verify a result was actually them before
committing to it. Added a **View** link per result that opens the
LinkedIn profile (`c.url`, already on FoundCandidate) in a new tab.

Restructured each result `<li>` into a flex row:
- Left: the existing pick button (title + `linkedin.com/in/<handle>`),
  now `flex-1 min-w-0` with `truncate` so long titles don't blow out
  the row.
- Right: a separate `<a target="_blank" rel="noopener noreferrer">`
  "View" link with an external-link glyph. It's a SIBLING of the pick
  button (not nested) so the HTML is valid — you can't put an anchor
  inside a button.

Added a one-line helper hint above the list ("Tap View to open a
result on LinkedIn and confirm it's you, then pick it.").

### Files touched:
- `src/components/FindHandleHelper.tsx`:
  - result list restructured to flex row with pick-button + View link
  - new `ExternalLinkIcon` SVG component
  - intro hint paragraph

### Notes / future ideas (user said "first…", more coming):
- The user framed this as the FIRST improvement to handle search.
  Likely follow-ups: richer result metadata (avatar, headline,
  location), better ranking, inline confirmation. Leaving the API
  shape (FoundCandidate: handle/url/title) untouched for now.

### Potential concerns:
- FoundCandidate.title is whatever Exa returned (stripped of the
  "| LinkedIn" suffix). If it's empty we fall back to the handle, so
  the row always shows something.
