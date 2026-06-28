# mobile-pass-2 — Mobile review of recently-shipped code

## Progress Update as of 2026-06-10 07:36 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Mobile (390px) review of everything shipped to the non-admin surface since the last pass (PR #308 → main `731dea2`): ~60 commits including Member Endorsements/vouching, profile credibility title + grouped/family/industry badges, event category badges + badge filter, changelog stat boxes, 3-way visibility slider, BrightData-driven profile changes. Net finding: the new code is already largely mobile-native. The one REAL, recurring bug was operator-entered event descriptions lacking word-break; fixed. Everything else was either already handled or is an owner-only editing affordance left as a recommendation.

### Detail of changes made (shipped):
- **Event descriptions now wrap long tokens.** Three renderers used bare `whitespace-pre-wrap` (preserves newlines but does NOT break long words), so a long URL or unbroken string in an operator-entered description forced horizontal page scroll on mobile. Added `break-words`:
  - `src/app/(authed)/events/[slug]/page.tsx` — upcoming-event description (l.173) AND past/Recap "Event Description" (l.327).
  - `src/components/events/CollapsibleDescription.tsx` (l.24) — the events-list/detail collapsible description.
  - (Chat + endorsement bodies via `MentionText` already had `break-words` — confirmed safe and left alone.)

### Verified-but-NOT-changed (audited, already mobile-native):
- **MemberEndorsements** (409-line new component): inline "fill-in-the-blank" upvote form uses `flex-wrap`; EndorseForm is `flex-col` with `MentionInput` `w-full`; points inputs are fixed-width but standalone. Fine.
- **EvalProgress** gold scoreboard: `justify-between` of two compact groups (Founder/Investor | Total) — fits; `text-3xl` total is a 2–3 digit number in ample space.
- **EventBadgeFilter**: `flex-wrap` of short category pills, no single pill exceeds container width.
- **ChangelogTimeline** stat boxes: `grid-cols-2 sm:grid-cols-4` = a clean 2×2 on mobile; verbose labels wrap, equal-height grid. Fine.
- **EditCredibilityTitle**, **VisibilitySlider**, **Recommendations**, **LeaderboardFilters/Client/ActiveFilters**, **MentionInput** dropdown (`w-full max-w-sm` caps to viewport), profile page badge rows (`flex-wrap`): all fine.

### Recommendations still open (judgment calls / need a real device):
- **`Badges.tsx` editing popovers** (owner-only). `TierPicker` (l.489) is `absolute left-0 min-w-[160px]` and `AddPicker` (l.561) is `absolute right-0 w-72` (288px). Each can clip past a screen edge depending on which pill the owner taps near the viewport boundary. Real but low-traffic; the correct fix (clamp/flip to viewport, e.g. a `max-w-[calc(100vw-1rem)]` + edge-aware anchor) wants a real-device check rather than a speculative blind change.
- Carried from last pass (still open): ProfileMiniTable name-column cramping with a Connect button; UpvoteButton 36px tap target; AttendeePhotoUpload small controls.

### Potential concerns to address:
- Verified by build + Tailwind reasoning, not a real 390px browser (no Playwright in repo). The Badges owner-edit popovers specifically deserve a device check.
