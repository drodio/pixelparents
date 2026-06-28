## Progress Update as of 2026-06-10 6:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged origin/main again. Reconciled a concurrent change: another agent enhanced the "People you've endorsed" line on main (truncated body preview + "+pts") using the old `e.points`; took that richer display but with my renamed `e.authorPoints`. tsc clean.

## Progress Update as of 2026-06-10 6:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The Endorse compose box now collapses by default: the heading is a "▸ Endorse <firstName>" toggle that expands the form on click (still only shown to claimed members on someone else's profile).

## Progress Update as of 2026-06-10 6:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged origin/main (which had its own 0050 migration); resolved the migration-number collision by dropping my 0050 and regenerating endorsement_contributions as 0051_petite_namor.sql. tsc clean post-merge.

## Progress Update as of 2026-06-10 6:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Major endorsements expansion (the PRD "stacking" mechanic) + display polish, all in this branch:
- **Co-signs / upvotes**: new `endorsement_contributions` table + `POST /api/endorsements/contribute`. Any claimed member (not the author/endorsee) can add points to an endorsement; anon → "claim your profile" message. Budget now sums authored + contributed points.
- **Card restructure**: header shows "+N pts from <gold name> <visibility pill>" on the LEFT (no Festival score); a larger **total chiclet** (author + all co-signs) top-right; co-sign lines "+N points from <name> <pill>"; endorsements ordered by total points desc.
- **Read more**: bodies clamp to 5 lines with a fade + "Read more" expander.
- **Public endorsements show to anonymous viewers** (list renders for everyone, visibility-filtered; only the compose/upvote actions gate on auth).
- **Preferred name**: endorser/contributor names use the claimer's nickname (e.g. "DROdio").
- **No "@"** before displayed mentions (gold name only). Gold @mentions in the compose box (overlay).
- Reworded the points label ("available across all your endorsements … apply to <firstName>").

### Detail of changes made:
- `src/db/schema.ts` (+ `scripts/apply-endorsement-contributions.ts`, drizzle 0050) — contributions table (dev applied; PROD pending).
- `src/lib/endorsements.ts` — totalPoints/authorPoints/contributions, budget sums both, ordering, addContribution, getEndorsementAuthor.
- `src/components/MemberEndorsements.tsx` — full card rewrite (EndorsementCard, UpvoteForm, ClampedText, EndorseForm).
- `src/components/events/chat/MentionInput.tsx` / `MentionText.tsx` — gold compose mentions / strip "@".
- `src/app/(authed)/profile/page.tsx` — anon-visible list, new props.

### Potential concerns to address:
- The total chiclet shows the sum of ALL points incl. hidden contributions (per "sum of all the points") — a viewer could infer hidden totals; acceptable per request.
- Endorsee can't upvote endorsements of themselves (self-promo guard).
- PROD migration for endorsement_contributions still pending.
