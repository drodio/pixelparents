# PRD — claimfade-cta (event UX tweaks batch)

## Progress Update as of 2026-06-07 10:51 AM Pacific
*(Most recent updates at top)*

### Summary
Batch of event-page UX tweaks: member-CTA copy, photo lightbox + keyboard nav +
lighter blur + locked-photo-click-to-claim, new lock labels, and radar legend
copy on event pages.

### Detail
- `ClaimFadeGate.tsx`: button "Claim your profile to read more" → "Become a
  Festival member to read more"; href "/" → "/?find=1".
- `event-recap.ts` photoLockLabel: "For attendees only" → "Private photo for
  event attendees"; claimed tier → "Private photo for Festival members".
- `PhotoCarousel.tsx`: blur-xl → blur-md (lighter); clicking a LOCKED photo →
  /?find=1 (claim); clicking the center UNLOCKED photo → lightbox modal
  (full-size, backdrop/✕/Escape to close, ‹ › + keyboard ← → to navigate);
  side photos still bring-to-center; window ← → keys navigate the carousel.
- `CredibilityRadar.tsx`: in chartOnly (event) mode the legend says "Event
  attendee average" (vs "this founder") and stacks the two legend items on
  separate lines.

### Verification
- `next build` compiles + typechecks.
