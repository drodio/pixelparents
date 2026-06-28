## Progress Update as of 2026-06-10 3:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the just-shipped endorsements not appearing for logged-in members. Root cause: the EventsCTA-hide + Member Endorsements gates keyed off `viewerHasClaim`, which means "the viewer claimed THIS profile" — false for a member viewing someone else's profile. Added `viewerIsMember = !!viewer.ownEvaluationId` ("viewer claimed their OWN profile") and switched the three gates to it.

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx`: new `viewerIsMember`; EventsCTA now hides when `viewerIsMember && !isOwner`; the endorsements section/data + `canEndorse` now gate on `viewerIsMember`.

### Potential concerns to address:
- `viewerIsMember` uses any-confidence ownEvaluationId; post-grandfather all claims are high, and the endorse API independently requires high.
