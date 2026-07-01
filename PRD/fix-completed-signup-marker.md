## Progress Update as of June 30, 2026 — 11:24 PM Pacific

### Summary of changes since last update
Fixed the landing/directory/dashboard counts, which were UNDER-counting (Daniel's repeat report). Three independent unbiased subagents investigated; 2 of 3 converged (and I verified against prod): the "completed signup" marker extra.notified='true' DRIFTED — an earlier flow stamped extra.welcomed instead, so only 6 of 12 genuinely-completed families carried notified. Switched the single completion predicate to completeSignup's durable artifact: share_token IS NOT NULL AND name AND email. Verified live: parents 6→12, families 5→11, kids 4→7 — now matching the admin panel exactly.

### Detail of changes made:
- lib/db/signups.ts: COMPLETED_SIGNUP_SQL → share_token+name+email; getBuilderCounts + getStudentBuilderCount switched off the raw notified filter (and getStudentBuilderCount, which previously had NO completion filter, now has one).
- lib/db/aggregates.ts: COMPLETED constant + new completedPredicate(alias) helper + completedFamily + the getStats fast-path inline all use the share_token predicate.
- lib/interests.ts: getInterestPool gains a { completedOnly } option; app/page.tsx passes it for the landing hero + mosaic (defensive — with current data drafts have no interests, so the count stays 29, which is CORRECT under the 12-family definition; the "17" some investigators cited was an artifact of the wrong notified=6 baseline).
- Tests updated to assert the share_token marker (no longer notified).

### Potential concerns to address:
- extra.notified/welcomed are now unused as count markers; the welcome-EMAIL cron still uses notified for its own purpose (unaffected — that's about emailing, not counting).
- share_token is minted at completion and kept even if sharing is later disabled, so it correctly counts everyone who finished the flow.
