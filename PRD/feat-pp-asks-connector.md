# feat/pp-asks-connector — OHS asks → expertise-matching connector

## Progress Update as of [June 30, 2026 — 1:25 AM Pacific]

### Summary of changes since last update
Initial build of the OHS asks → expertise-matching connector (v1), stacked on
`feat/pp-enrichment-ui` (PR #108). A verified OHS family posts an ASK tagged with
the expertise they need; a pure, DB-free matcher ranks community members by
expertise-tag overlap; eligible helpers (verified, non-student, not the asker)
offer help; the asker accepts/declines; on accept an in-app intro path is
revealed to the helper's visibility-gated profile. New `/asks` board + post +
detail surfaces, an "Asks" nav tab, three Clerk-auth'd + verification-gated server
actions, and two self-healed tables. tsc clean, lint clean (no new errors), 293
tests pass (+23 new), `npm run build` green (all three routes compiled).

### Detail of changes made:
- **Tables** (`lib/db/schema/asks.ts`, re-exported in `lib/db/schema/index.ts`):
  - `asks`: id, author_signup_id (FK signups, cascade), author_clerk_id, title,
    body, expertise_tags text[], status (`open|matched|closed` default open),
    created_at, updated_at.
  - `ask_responses`: id, ask_id (FK asks, cascade), responder_signup_id (FK),
    responder_clerk_id, offer, proposes (`async|zoom|dinner|other` default async),
    status (`offered|accepted|declined` default offered), created_at, decided_at.
- **Self-heal** (`lib/db/ensure.ts` → `ensureAsksSchema`): idempotent CREATE +
  ALTERs + two indexes, one round-trip, cached promise with reset-on-failure
  (mirrors ensureApiKeysTable/ensureFamiliesSchema). EVERY read/write path in the
  data layer calls it first (the country-column P0 lesson).
- **Data layer** (`lib/db/asks.ts`): listOpenAsks, getAskById,
  listResponsesForAsk, countAsksByAuthorSince (rate limit), hasResponded,
  getResponseById, getSuggestedHelpers (DB↔matcher adapter), createAsk,
  createResponse, decideResponse (asker-scoped WHERE = authorization; flips ask to
  `matched` on accept). Enums: AskStatus, AskResponseStatus, AskProposes, ASK_PROPOSES.
- **Matcher** (`lib/ask-matching.ts`, PURE + DB-free + deterministic + keyless):
  `rankCandidates({ askTags, candidates, excludeSignupId, limit })`. Overlap-count
  scoring; overlapTags in ask order; EXCLUDES students + asker + zero-overlap;
  empty ask tags → []. Stable tiebreak: score desc → signalCount desc (richer
  enrichment first) → name asc → signupId asc. Clear seam for future AI matching.
- **Expertise signals** (`lib/directory.ts` → `expertiseSignalsOf`): union of a
  member's curated `extra.enrichment.info.expertiseTags` (owner-edits merged) ∪
  `skillsets` ∪ `parentInterests`, deduped case-insensitively. Used to build
  matcher candidates AND as the signalCount richness proxy.
- **Validators** (`lib/ask-validate.ts`, pure): title/body/offer length +
  control-char cleaning; free-text expertise tags sanitized + capped (pixelparents
  uses free-text interests, not a fixed slug vocab); validateProposes.
- **Server actions** (`app/(authed)/asks/actions.ts`, Clerk-auth'd): createAskAction
  (verified family; parent OR student; per-author rate limit 5/hr),
  respondToAskAction (verified, NON-student, not asker, open ask, one offer/ask),
  decideResponseAction (only the asker, via decideResponse's scoped WHERE). Caller
  identity always from the session; never trusted from the client.
- **Pages** (gated to VERIFIED OHS families — signed-out → grayed shell;
  unverified/non-family → verify/join prompt): `/asks` board (open asks newest
  first + expertise-tag facet filter reusing the directory chip UI + "Post an ask"
  CTA), `/asks/new` (title/body/tag-picker with the asker's own expertise as quick-
  adds), `/asks/[id]` detail (the ask + "Suggested people who can help" matcher
  cards with overlap chips + offer form for eligible helpers + responses the asker
  can accept/decline + on-accept intro path to the helper's visibility-gated
  /community/<token> profile).
- **Nav**: added an "Asks" tab (IconHeart) to `components/dashboard-shell.tsx`.
- **Tests**: `lib/ask-matching.test.ts` (11 cases: no-tags, no-overlap, scoring +
  ordered overlap, student exclusion, asker exclusion, case/whitespace, all three
  tiebreaks, limit, dup/blank tags) and `lib/ask-validate.test.ts` (12 cases).

### Privacy / auth model (end to end):
- Every actor must be a verified OHS family (isFamilyVerified). Students may ask
  but never help. Only the asker decides on their ask's responses.
- A suggested-helper card and a responder's name carry a profile LINK
  (`/community/<token>`) ONLY when that member passes `isDirectoryVisible` (opted
  into sharing) — otherwise name only, never a path to a private profile. The
  matcher itself reads raw expertise signals only for ranking, never for display.
- A non-asker viewing a detail page sees only their OWN offer; the asker sees all.
  The intro path reveals only on an ACCEPTED offer, to the asker or accepted helper.
- No PII/secrets committed. Free-text tags only; no child names/contacts.

### Potential concerns to address:
- Rate limiting is per-author DB-count (5 asks/rolling hour) rather than per-IP
  (no shared rate-limit primitive exists in this repo). Adequate for v1.
- `getSuggestedHelpers` loads all verified signups then ranks in memory — fine at
  current scale; revisit with a tag-array `&&` overlap pre-filter (Postgres
  `text[]` overlap) if the directory grows large.
- Preview screenshot skipped: the surface is fully gated behind Clerk auth + a
  verified DB-backed signup, and the running preview server pre-dates this branch,
  so a browser render would only show the sign-in/grayed-shell path. Verified via
  the four gates instead (tsc/lint/test/build).

### OUT OF SCOPE (follow-ups, per spec):
AI matching (the matcher seam is ready for it), upvotes, scheduling/calendar,
email notifications (in-app only for v1), public signed-out board.
