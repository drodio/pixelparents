## Progress Update as of 2026-06-08 11:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Cleaned up the low-signal profile page (e.g. festival.so/profile/founder/aman-sharma — an eval without enough public data to score). Removed the placeholder "0", de-boxed and enlarged the "not enough data" message, turned the claim CTA into a gold link, and dropped the unclaimed-notice + events button on this view.

### Detail of changes made:
- `src/components/LowSignalProfile.tsx`:
  - Removed the `0` placeholder score and the bordered card wrapper.
  - "Not enough public data to score this person." is now a plain `text-xl sm:text-2xl` line on the page (no box).
  - Replaced the plain "Is this you? Claim your profile to add your information." text with the new `LowSignalClaimCTA` (only when `!isOwner`).
  - Removed `UnclaimedNotice` ("This profile has not been claimed…") and `EventsCTA` ("Show me Founder Festival Events I Qualify For") from this view (and their imports).
- New `src/components/LowSignalClaimCTA.tsx` (client): renders "Is this you? **Claim your profile** to add your information." where "Claim your profile" is a gold (`#D4A24A`) link that opens `ClaimProfileModal`.

### Potential concerns to address:
- `LowSignalProfile.tsx` still trips the pre-existing `@next/next/no-html-link-for-pages` lint error on the `<a href="/?home=1">` back-link — unchanged from origin/main, not introduced here; repo CI already tolerates many such errors.
- The richer (scored) profile page still renders `UnclaimedNotice` + `EventsCTA`; this change only affects the low-signal branch.
