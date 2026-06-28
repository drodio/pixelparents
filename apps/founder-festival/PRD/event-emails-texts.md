## Progress Update as of 2026-06-14 2:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
SHIPPED TO PROD. Fast-forwarded `main` to this branch (commit c14413c) → Vercel
production deploy is live and healthy. Verified the full deployed pipeline
end-to-end: seeded a due scheduled campaign in prod, the deployed every-minute
cron drained it, rendered + sent a real email to drodio@festival.so via the live
Resend integration, and logged the member_message (status flipped scheduled→sent,
logged=1). Proof rows then deleted from prod; the delivered email is the proof.

### Detail of changes made:
- Pushed branch + fast-forwarded `origin/main` to c14413c. Prod deploy `pn1pbqfp0`
  built (59s) and is Ready/live.
- Verified live routes: `GET /api/cron/event-email-tick` → 401 (exists, gated),
  `POST /api/admin/events/:id/emails` → 403 to unauth (security confirmed),
  homepage → 200.
- Migration 0060 already applied to dev + prod earlier this session.
- End-to-end prod send verified via deployed cron (then cleaned up).

### Operational notes for the next session:
- Local `.env.prod.local` REDACTS all secrets (RESEND_API_KEY, CRON_SECRET,
  DATABASE_URL) — only the Neon `POSTGRES_*` connection strings retain values. So
  prod email/cron can only be triggered from the deployed app (or by seeding the DB
  + letting the deployed cron fire), NOT from a local script.
- 9 Vercel crons now (added event-email-tick `* * * * *`); confirmed firing in prod.

### Still genuinely open (non-blocking, deferred):
- Backfill chat-mention emails into Messages (event-chat-email.ts owned by a
  parallel agent — do after their branch merges) + event approve/waitlist decisions.
- `company-name` variable renders blank until AdminAttendeeRow carries company.

## Progress Update as of 2026-06-14 2:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phases 3 + 4 + backfill built — the feature is now functionally complete.
**Migration 0060 has been applied to BOTH dev and prod Neon** (additive +
idempotent, via the new `scripts/apply-event-emails-migration.ts`, mirroring the
existing apply-event-location-migration pattern; "never db:push" respected — direct
surgical SQL). Next step is merge → deploy → send a real test email.

### Detail of changes made:
- **Migration applied**: `scripts/apply-event-emails-migration.ts --target=dev|prod`.
  Verified on both: message_campaigns OK, member_messages OK, pref cols 2/2.
  (Dev's drizzle.__drizzle_migrations is empty — this repo applies schema via
  direct SQL/db:push, NOT drizzle-kit migrate. Do NOT run `drizzle-kit migrate`.)
- **Phase 3 — scheduling cron**: `drainScheduledCampaigns()` in event-email-send.ts
  (atomic scheduled→sending CLAIM so overlapping ticks can't double-send; per-
  campaign error isolation; caps 25/tick). NEW `/api/cron/event-email-tick` route
  (CRON_SECRET Bearer auth) + registered in vercel.json at `* * * * *`.
- **Phase 4 — /account**: notification-prefs restructured into TWO boxes —
  "Global notifications" (festival updates + investor/founder/sponsor intros) and
  "Event notifications" (id="event-notifications" anchor; "Invite me to events I
  qualify for" moved here + NEW "Send me event logistics (updates, reminders, etc.)"
  email+text toggles, default on). `/api/account/preferences` now reads/writes
  prefEmail/TextEventLogistics. NEW Messages inbox: `src/lib/member-messages.ts`
  (deploy-safe viewer query by clerk id OR eval id) + `MessagesSection.tsx`
  (forward-only, expandable, event pill → event page) wired into the account page.
- **Backfill**: `logMemberMessage` added to `endorsement-email.ts` (endorsement
  notifications) and `attendee-connections.ts` `introduceConnection` (both parties
  of a connection intro). These now appear in /account → Messages.

### Potential concerns to address:
- **Backfill DEFERRED** for: chat-mention emails (event-chat-email.ts is being
  actively edited by a parallel agent — avoided to prevent merge collision) and
  event approve/waitlist decision emails (no clean single send site found; revisit).
- Migration tracking table is empty on dev — future migrations must continue via
  direct SQL scripts, not drizzle-kit migrate.
- 21 unit tests pass; cron/drain + member-messages are DB-bound (not unit-tested).

## Progress Update as of 2026-06-14 12:52 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 2b — the **composer UI** is built and wired. The "Emails & Texts"
CollapsibleSection now sits between Attendees and Description on
`/admin/events/[id]` with a Send button, a past-communications table (with an
expandable per-campaign drill-down), and a full composer: recipient table
(attendees + "All attendees", showing emails + scores), From dropdown, @-mention
variable pill input (subject + body), editable signature, and a live preview pane
with ◀▶ attendee cycling + "Send a preview". Type-clean, builds, 21 unit tests pass.

### Detail of changes made:
- **DB-free render split**: extracted `escapeHtml`/`renderSignatureHtml`/
  `buildEmailHtml`/`renderForRecipient`/`CampaignRecipient` into NEW
  `src/lib/email-render.ts` (no `db` import). `email-signature.ts` and
  `event-email-send.ts` now re-export from it. This lets the client live-preview
  call the EXACT same renderer as the server send (preview == sent) without
  dragging the DB module into the browser bundle. Test retargeted to email-render.
- NEW `src/lib/email-template-doc.ts` (pure) — `templateToDoc()` converts a
  `{{key}}`/`{{key:max=N}}` template string into a TipTap doc. 6 new unit tests.
- NEW `src/components/admin/email/VariablePillInput.tsx` — TipTap editor; "@" opens
  a static variable catalog dropdown; pills render via a React NodeView; clicking a
  truncatable pill opens an inline max-chars popover (portal). Serializes back to
  the marker string via `getText({ blockSeparator: "\n" })` (each pill's renderText
  emits its marker). Single-line mode (subject) swallows Enter.
- NEW `EmailComposer.tsx` — channel checkboxes (Text disabled/"soon"), recipient
  table, From dropdown, subject/body pill inputs, signature textarea, live preview
  (dangerouslySetInnerHTML of buildEmailHtml output) with ◀▶ cycling, "Send a
  preview" (unlogged), and Send-now / Send-on (datetime-local). Posts to the
  existing `/emails` + `/emails/preview` routes.
- NEW `EmailsTextsPanel.tsx` — Send button + composer toggle + past-comms table
  ("Sent to" / Subject / Via / On / Status) with row-expand drill-down.
- NEW `GET /api/admin/events/[id]/emails/[campaignId]` — drill-down detail
  (manage_events-gated + canAccessEvent + event ownership check).
- `listEventCampaigns` now returns `sentToLabel` (single name vs "N attendees")
  and is **deploy-safe** (try/catch → `[]`) so the admin event page renders even
  if this ships ahead of migration 0060.
- Wired into `admin/events/[id]/page.tsx`: loads `listEventCampaigns` +
  `getEmailSignatureText` in the page Promise.all; passes emailable attendees,
  event vars, per-eval personalized HTML, from-options, signature, viewer email.

### Potential concerns to address:
- `company-name` variable still renders blank (no companyName on AdminAttendeeRow).
- Live preview's `{{attendee-count}}` uses the selected/candidate count, which is an
  approximation matching the send path's behavior.
- Build needs DATABASE_URL to pass page-data collection locally (env, not code).
- STILL TODO: scheduling cron (`/api/cron/event-email-tick`), `/account`
  notification-prefs restructure + Messages inbox + `GET /api/account/messages`,
  backfill `logMemberMessage` into existing member emails, apply migration 0060 to
  dev+prod Neon, then merge + deploy + send a real test email.

## Progress Update as of 2026-06-14 12:36 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Resumed the parked branch after ~2 days. Created a dedicated git worktree
(`.claude/worktrees/event-emails-texts`) so this work no longer collides with the
main checkout (another agent is mid-flight there on chat-nickname emails). Merged
`main` into the branch and resolved a Drizzle migration-number collision: main
shipped its own `0059` (`events.location`) while this branch's `0059` (message
tables + event-logistics prefs) sat unmerged. Took main's `0059` for the meta
journal/snapshot, dropped the stale `0059_nice_thanos.sql`; this branch's migration
will be regenerated as `0060` from the merged schema.

### Detail of changes made:
- New worktree at `.claude/worktrees/event-emails-texts` on branch `event-emails-texts`.
- Merged `main` (10 commits: chat edit/delete, event location, docs refresh, #385
  collapsible admin sections, NFX bookmarklet, etc.).
- `src/db/schema.ts` auto-merged clean — now carries BOTH main's `events.location`
  AND this branch's `message_campaigns` / `member_messages` tables + the two
  `users.pref_*_event_logistics` columns.
- Removed `drizzle/0059_nice_thanos.sql`; meta now ends at main's `0059_rare_wither`.

### Potential concerns to address:
- Branch migration must be regenerated as `0060` and apply cleanly AFTER main's
  `0059` on both dev and prod Neon. Nothing applied to any DB yet.
- `AdminAttendeeRow` has no `companyName`, so the `company-name` variable renders
  blank until attendee company data is wired through.
- Texts channel intentionally stubbed; email-only for the first ship.

## Progress Update as of 2026-06-12 7:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 2a (API layer) built + type-clean + building. Composer UI is the next (large) piece.

### Detail of changes made:
- `event-email-send.ts`: `EVENT_EMAIL_FROM_OPTIONS`/`isAllowedFrom`,
  `createEventCampaign` (resolves clerk ids, snapshots recipients, scheduled vs send-now),
  `listEventCampaigns` + `getEventCampaignDetail` (the "Emails & Texts" table + drill-down).
- Routes: `POST /api/admin/events/[id]/emails` (send-now inline or schedule),
  `POST /api/admin/events/[id]/emails/preview` (one test send, unlogged). manage_events gated.
- Both routes register; 15 unit tests pass; 0 type errors.

### Next:
- Composer client component (pill input modeled on MentionChipInput + recipient table +
  live preview/cycling + send-now/on) → wire the "Emails & Texts" CollapsibleSection.
- Then scheduling cron + /account restructure + Messages + backfill.
## Progress Update as of 2026-06-12 7:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Owner approved the spec → building. Phase 1 (backend foundation) done + tested:
data model, variable engine, and the full send path. 15 unit tests pass, 0 type errors.

### Detail of changes made:
- Migration 0059: `message_campaigns` (per blast; stores pill templates + recipient
  snapshot jsonb + schedule/status) + `member_messages` (per recipient; the /account
  inbox + campaign drill-down) + `users.pref_*_event_logistics` (default true).
- `src/lib/email-variables.ts`: catalog (12 vars), `renderTemplate` ({{key}} / :max=N),
  `htmlToText`, `buildRecipientValues` (profile-url → /?find=1 fallback). Tested.
- `src/lib/event-email-send.ts`: `buildEmailHtml` (plain→HTML + signature + unsubscribe
  footer), `renderForRecipient`, best-effort `logMemberMessage`, `sendEventCampaign`
  (re-resolve event/personalized, opt-out filter, per-recipient isolation, mark sent),
  `sendPreviewEmail`, `resolveClerkIdsForEvaluations`. Tested.
- `email.ts`: `sendRawEmailWithoutSignature` (composer controls its own signature).

### Next (remaining phases):
- Composer UI (pill input + recipient table + live preview + cycling + send-now/on) +
  the "Emails & Texts" CollapsibleSection + API routes.
- Scheduling cron. /account prefs restructure + Messages section + backfill logging.
## Progress Update as of 2026-06-12 6:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Branch created for the event "Emails & Texts" feature. Brainstormed with the owner
(8 questions answered) and wrote the design spec at
`docs/superpowers/specs/2026-06-12-event-emails-texts-design.md`. No code yet —
awaiting owner review of the spec before implementation.

### Detail of changes made:
- Feature: admin composes/sends email (texts later) to an event's attendees, with
  variable pills + per-pill max-char, live per-attendee preview, send-test, and cron
  scheduling; every send logged; a member's received emails surface on `/account`.
- Data model: `message_campaigns` (per blast) + `member_messages` (per recipient) +
  new `users.pref_*_event_logistics` columns (migration required).
- `/account` gets a notifications restructure (Global vs Event boxes, new event-logistics
  pref default-on) + a Messages section (forward-only) + unsubscribe footer target.
- Depends on `CollapsibleSection` (PR #385) — implementation rebases onto main after #385.

### Potential concerns to address:
- Large feature → spec phases it into 4 PRs (data/engine → composer → scheduling →
  account+backfill). Texts stubbed throughout.
- GitHub Actions billing outage (org-wide) was resolved by the owner 2026-06-12; CI green
  again.
