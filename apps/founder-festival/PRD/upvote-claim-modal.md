## Progress Update as of 2026-06-10 7:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
UpvoteForm polish: (1) an unauthenticated/unclaimed user clicking Submit now opens the standard ClaimProfileModal (same as elsewhere) instead of an inline message; (2) the points input is empty by default (no "0") — just type a number; (3) the Submit button moved onto the "…of your Festival points." line (to the right of the points text), with the visibility slider on its own row below.

### Detail of changes made:
- `src/components/MemberEndorsements.tsx`: UpvoteForm uses ClaimProfileModal (opened on anon Submit or a 401/403), `pointsStr` empty-string state, and the relaid-out row. Threaded `claimEvaluationId` (the viewed profile's eval) + `firstName` through EndorsementCard.

### Potential concerns to address:
- The claim modal is tied to the viewed (endorsee's) profile, matching the rest of the app's "claim this profile" prompts.
