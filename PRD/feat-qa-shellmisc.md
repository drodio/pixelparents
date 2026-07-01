# feat/qa-shellmisc — QA fix pass (app shell, notifications, help/feedback, admin, changelog, legal, report/error)

## Progress Update as of [June 30, 2026 — 9:53 PM Pacific]

### Summary of changes since last update
First commit of the QA-shellmisc fix pass. Cleared the notifications-center bucket
(findings 1, 2, 8, 9): the sidebar bell now reconciles its unread badge in the same
viewport after an in-page mark-read, mark-read failures roll back the optimistic UI
and surface an inline error, the header subtitle reads the true server-side unread
COUNT (no more 50-row undercount), and the empty state reuses the canonical subtitle
copy so it can't promise fewer sources than the app emits.

### Detail of changes made:
- **[1] Bell stale badge** — `notifications-client.tsx` dispatches a
  `window` event `"notifications:changed"` after a mark-one / mark-all persists;
  `notification-bell.tsx` adds a listener that calls `refresh()` (alongside its focus
  listener). router.refresh() alone never changed the bell's deps, so the badge stayed
  stale next to a zeroed list.
- **[2] Swallowed mark-read failures** — `notifications-client.tsx` now checks the
  `NotifActionResult`: on `!ok`/reject it rolls the affected row(s) back to unread and
  shows an inline `role="alert"` error in the header. `markAll()` snapshots + restores
  the full list on failure.
- **[8] Subtitle undercount >50** — `page.tsx` now fetches `unreadCount(signup.id)`
  alongside `listNotifications` and passes it as `unreadTotal`; the client uses
  `max(loadedUnread, unreadTotal)` so the subtitle matches the bell's COUNT source.
- **[9] Empty-state copy** — empty state now renders `notificationsSubtitle(0, 0)`
  (the canonical "no notifications yet" string covering posts/replies/connections/
  mentions/events/boards) instead of a hand-written list that omitted half the types.

### Files touched (this commit)
- `components/notification-bell.tsx`
- `app/(authed)/notifications/notifications-client.tsx`
- `app/(authed)/notifications/page.tsx`

### Validation
- `npx tsc --noEmit`, `npm run lint`, `npm test` — see commit body.
- `next build` NOT run in the worktree (per directive).

### Deferrals (files outside owned set — not touched)
- **[4]** `components/signed-out-panel.tsx` — Create-account href → `/signup`. Not owned.
- **[5]** `app/p/[token]/page.tsx` — hardcoded OG image path. Not owned.
- **[6]** `lib/ask-validate.ts` — ask-worded validation copy. Not owned.
- **[7]** `app/api/blob/upload/route.ts` — MIME allow-list vs client `accept`. Not owned.
- **[16]** `lib/format.ts` — `formatLastUsed` UTC fallback tz. Not owned.

### Potential concerns to address:
- The `"notifications:changed"` event is a lightweight cross-component reconcile;
  a shared context/provider would be sturdier but is a larger refactor across the
  shell. The event approach is minimal and self-contained.
