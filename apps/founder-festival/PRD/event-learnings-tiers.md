# Three learnings tiers + personalized AI learnings (AI vs Chief)

## Progress Update as of 2026-06-10 5:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
(1) Post-event learnings are now THREE tiers — public (green), members-only (purple, NEW),
attendees-only (amber) — editable in the admin event page. (2) A new "Personalized Learnings
for <name>" section (above public) generates learnings tailored to the viewer from their
Festival profile + all event learnings, with an admin eval page comparing AI Gateway vs Chief
(quality + cost).

### Detail of changes made:
- Migration `0053_cynical_lady_bullseye.sql`: `events.learnings_members text`. Apply via
  `node scripts/apply-learnings-members.cjs` (dev: .env.local; prod: pass .env.prod.local).
  **getEventBySlug does SELECT *, so a missing column 500s the event pages — apply to prod
  BEFORE merge.** (Dev event pages currently fall to the error boundary until dev is applied.)
- `EventLearningsEditor` + `/api/admin/events/[id]/learnings`: third "Members-only" field.
- Recap (`events/[slug]/page.tsx`): three colored boxes — public=emerald, members=purple
  (claimed members), attendees=amber — in that order. Members tier gated on a claimed profile.
- Personalized AI learnings:
  - `lib/personalized-learnings.ts`: gathers all tiers + builds a profile summary (scores,
    statuses, recommendations summary, per-dimension score_items rationale) and prompts for
    probing+supportive HTML. Two backends: `generatePersonalizedAI` (AI Gateway, opus-class,
    returns token usage + est $ cost) and `generatePersonalizedChief` (chiefSearch research;
    credits aren't API-exposed so we report CALL COUNT — reconcile in the Chief dashboard).
  - Recap section `PersonalizedLearnings` (members/attendees, on-demand button, self-only via
    `POST /api/events/[slug]/personalized` which only feeds tiers the viewer is entitled to).
  - Admin eval page `/admin/events/[id]/personalized` (+ link from the Learnings section):
    pick a person (defaults search to "DROdio"), generate via BOTH backends side by side with
    cost/latency. API `POST /api/admin/events/[id]/personalized {evalId, method}`.
- Chief: reuses existing `lib/chief.ts` (api.storytell.ai, X-API-Key/X-Project-Id, poll for
  `response`). Verified against dev.chief.bot — base/headers/endpoints + `intelligence`
  (auto|fast|expert|research) + `public_data` all current. Needs CHIEF_API_TOKEN +
  CHIEF_PROJECT_ID set (prod env) or the Chief side returns a "not configured" message.

### Part 2 — one-event data move (run manually):
- `scripts/move-event-learnings.cjs <env> 9nj5he2k` (dry run) moves everything in attendees
  → members EXCEPT the "Founder Festival algorithm" section (split at the first /algorithm/i
  heading). Re-run with `--apply` once the dry-run split looks right.

### Potential concerns to address:
- Personalized learnings aren't cached — each click is an LLM call (button-gated, not on load).
- Cost: AI side reports est $ from list prices; Chief credits must be read from the dashboard.
