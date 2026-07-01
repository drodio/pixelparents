# feat/qa-shellmisc — QA fix pass (app shell, notifications, help/feedback, admin, changelog, legal, report/error)

## Progress Update as of [June 30, 2026 — 9:58 PM Pacific]

### Summary of changes since last update
Changelog bucket (findings 13, 14, 15). Fixed the unsubscribe not-found copy so it
stops promising a changelog manage flow that doesn't exist; added a per-IP rate
limit to the public subscribe endpoint (the easy-abuse hole); and made the subscribe
form distinguish a permanent 400 (edit the address) from a transient 429/5xx/network
error (retry), plus a `maxLength={200}` to match the server cap.

### Detail of changes made:
- **[13] Unsubscribe not-found copy** — `api/changelog/unsubscribe/route.ts` "not-found"
  page now says "use the unsubscribe link in your most recent Pixel Parents email"
  instead of pointing to a nonexistent changelog manage UI (honest option a).
- **[14] Subscribe abuse** — `api/changelog/subscribe/route.ts` gains a best-effort
  in-memory per-IP limiter (5 / 10 min, mirroring the report action), returning 429
  when tripped. NOTE: double opt-in (insert-as-pending + tokenized confirm) is the
  fuller consent fix but is a larger email-flow change — deferred as a follow-up,
  the rate limit closes the flood/enroll-arbitrary-address hole. `lib/changelog.ts`
  unchanged.
- **[15] Misleading "try again"** — `app/changelog/subscribe.tsx` maps `res.ok→done`,
  `400→invalid` ("Enter a valid email."), `429|5xx/network→failed` ("try again");
  added `maxLength={200}` so the client can't submit past the server's cap.

### Files touched (this commit)
- `app/api/changelog/unsubscribe/route.ts`
- `app/api/changelog/subscribe/route.ts`
- `app/changelog/subscribe.tsx`

---

## Progress Update as of [June 30, 2026 — 9:57 PM Pacific]

### Summary of changes since last update
Admin triage feedback (finding 11) + PWA install prompt reach (finding 17). Admin
status-change buttons now disable + show "Saving…" while their server action is
pending (no more silent double-submits), and the install banner now mounts inside
the persistent DashboardShell so it can surface on the authed surfaces (it already
self-gates mobile-only / hide-when-installed).

### Detail of changes made:
- **[11] No feedback on admin status change** — new `app/(authed)/admin/status-submit-button.tsx`
  client component uses `useFormStatus()` to disable + swap in a "Saving…" label
  while the enclosing form's action is pending. Wired into all three
  `/admin/feedback` controls (reviewed/resolved/reopen) and both `/admin/reports`
  controls (resolve/reopen).
- **[17] PWA prompt only on landing** — `dashboard-shell.tsx` now renders
  `<InstallPrompt/>` (authed branch only). The component self-gates (mobile-only,
  hides once installed/dismissed), so the authed users most likely to install
  finally see "Add to home screen".

### Files touched (this commit)
- `app/(authed)/admin/status-submit-button.tsx` (new)
- `app/(authed)/admin/feedback/page.tsx`
- `app/(authed)/admin/reports/page.tsx`
- `components/dashboard-shell.tsx`

---

## Progress Update as of [June 30, 2026 — 9:55 PM Pacific]

### Summary of changes since last update
Cleared the feedback bucket (findings 3, 10, 12): unverified-but-signed-in users
can now send feedback (dropped the verified gate — the author is already resolved
server-side and the gate silenced the "I can't verify" notes we most need); the
confirmation no longer over-promises a follow-up the app can't deliver; and the
sent confirmation now survives a popover close/reopen so a cautious user doesn't
re-submit a duplicate note.

### Detail of changes made:
- **[3] Feedback dead-end for unverified users** — `feedback-actions.ts` removes the
  verified-family gate entirely (option a). Still resolves the signup id best-effort
  for coarse admin attribution; dropped now-unused imports (`isAdminEmail`,
  `getFamilyForEmail`, `verifiedEmailsOf`). Signed-in is the only requirement.
- **[10] Over-promised follow-up** — `feedback-widget.tsx` confirmation copy changed
  from "We may follow up…" to "We read every note — thanks for helping us improve."
  (feedback stores no contact email and admin triage has no reply affordance).
- **[12] Lost confirmation on reopen** — lifted the `sent` state up to `FeedbackWidget`;
  `FeedbackComposer` now accepts optional controlled `sent`/`onSentChange` props
  (defaults to internal state for the still-mounted help-menu sheet path). Reopening
  the sidebar popover after a successful send shows the confirmation, not a fresh form.

### Files touched (this commit)
- `app/(authed)/feedback-actions.ts`
- `components/feedback-widget.tsx`

---

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
