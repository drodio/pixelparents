## Progress Update as of 2026-06-09 — hosts/sponsors treated as attendees
*(Most recent updates at top)*

### Summary of changes since last update
Event hosts and sponsors now see everything an attendee sees on an event page.
One-line-of-intent change in the shared attendee gate. No DB migration (uses
existing hostProfiles / sponsorProfiles / eventHosts / eventSponsors tables).

### Detail of changes made:
- src/lib/attendee.ts `isEventAttendee(eventId, evalId)` now returns true if the
  profile is an approved RSVP OR is linked (via hostProfiles→eventHosts or
  sponsorProfiles→eventSponsors) to a host/sponsor of that event. Since every
  access gate (recap photos/learnings/attendee hub via getViewerAttendeeContext,
  attendees-only chat, photos, connect, contact-sharing) flows through this one
  helper, hosts/sponsors are now treated as attendees everywhere for ACCESS.
- They are NOT added to the attendee list or capacity counts (those query
  eventAttendees directly), so this is view/participation access only.

### Potential concerns to address:
- Matching requires the host/sponsor to have a CLAIMED profile attached
  (hostProfiles/sponsorProfiles.evaluationId = the logged-in user's evaluation).
  A host/sponsor with no attached profile won't be recognized — that's the only
  link between a host/sponsor entity and a logged-in user.
