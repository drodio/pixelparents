# Admin RBAC scope fixes — admin-idor-scope-fixes

## Progress Update as of 2026-06-10 — Sprint 1 batch 2 (admin IDOR)
*(Most recent updates at top)*

### Summary of changes since last update
Closed the two cross-tenant admin IDORs from the 2026-06-10 audit (Security #2/#3).
`manage_events` is a delegatable grant, so admins scoped to one org/event could
mutate others.

### Detail of changes made:
- **org-badges POST/DELETE** now scope to the actor's org assignments:
  new `canManageOrg(ownerType, ownerId)` gates CREATE; `canApplyOrgBadge(id)` gates
  DELETE (which cascades a strip from every profile carrying the badge).
- **12 event sub-editor routes** (`date, hosts, learnings, slug, sponsors, priorities`,
  + 6 `photos/*`) now call `canAccessEvent(id)` after `requireGrant` — matching the
  sibling attendees/applicants routes — so a scoped event-manager can't rewrite the
  slug/date/recap/photos of events it doesn't own. `photos/upload` checks inside
  `onBeforeGenerateToken`.

### Remaining: batch 3 (score-item points clamp, chat caps, delete _tmpseed.cjs,
perf indexes SQL, .env.example), batch 4 (inbound-webhook sender verification +
email idempotency + external-call timeouts), then Sprint 2 perf.
