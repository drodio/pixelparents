## Progress Update as of 2026-06-08 — attendee-list claim CTA
*(Most recent updates at top)*

### Summary of changes since last update
On public event pages (e.g. /events/<slug>), the unclaimed-viewer attendee notice
now has a second line inviting attendees to claim their profile.

### Detail of changes made:
- src/components/events/AttendeesTable.tsx: the `!isClaimed` notice was a single
  line ("Become a Festival member to see the attendee list."). Added a second
  line: "Did you attend this event? Claim [your profile] to log in and connect
  with other attendees." where "your profile" links to `/?find=1` — the home-page
  find-my-LinkedIn name search (SplashForm opens it on ?find=1), same target as
  the existing "Become a Festival member" link. Wrapped both in a flex-col so
  they stack on separate lines.

### Potential concerns to address:
- None — pure copy/markup change, no logic.
