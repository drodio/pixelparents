# Event "Emails & Texts" — admin compose/send + member Messages

**Date:** 2026-06-12
**Branch:** `event-emails-texts` (implementation rebases onto `main` after PR #385 merges — it needs `CollapsibleSection`)
**Status:** Design — pending owner review of this spec.

## Goal

Let an admin compose and send an email (texts later) to an event's attendees from the
event page, with variable "pills", a live per-attendee preview, test-sends, and
scheduling; log every send; and surface a member's received emails on `/account`.

## Decisions (from brainstorming Q&A)

1. Recipients = the event's **attendees** (`eventAttendees`, Luma-synced, incl. **unmatched**
   ones that have an email but no profile). `profile-url` for someone with no profile →
   the home page with find open (`/?find=1`).
2. Two-table log: a per-send **campaign** row + per-recipient **message** rows.
3. `/account` Messages is **forward-only** (historical emails were never body-stored).
4. Blasts **respect opt-out** via a new "event logistics" preference; emails carry an
   unsubscribe footer → `/account` (scrolled to the new Event-notifications box).
5. Variables confirmed incl. company-name, personalized-learnings, event-date, venue;
   HTML-sourced variables are **stripped to plain text**.
6. **Any admin** can send.
7. "Send on" → queue drained by a 1–2 min **prod-only cron**; "send now" sends inline.
8. "Send preview to <email>" renders for the shown attendee but delivers to the typed
   address and is **not logged**.

## Data model (migration required)

### `message_campaigns` (one row per send/blast)
`id` uuid pk · `event_id` uuid (nullable, FK events) · `created_by_clerk_user_id` text ·
`channel` text (`email` | `text` | `both` — text path stubbed) · `from_address` text ·
`subject_template` text · `body_template` text · `recipient_count` int ·
`scheduled_for` timestamptz (null = send-now) · `status` text (`scheduled` | `sending` |
`sent` | `failed`) · `sent_at` timestamptz (null until sent) · `created_at`.
Templates store the raw pill markers (see Variable engine) so a campaign can be
re-previewed/audited.

### `member_messages` (one row per recipient per send — the `/account` inbox + audit)
`id` uuid pk · `campaign_id` uuid (nullable FK — null for system emails like connection
requests) · `clerk_user_id` text (nullable — recipient when claimed) · `to_evaluation_id`
uuid (nullable) · `to_email` text · `from_address` text · `type` text (e.g.
`event_blast`, `connection_request`, `connection_intro`, `event_approved`,
`event_waitlist`, `endorsement`, `event_chat_mention`) · `subject` text (rendered) ·
`body` text (rendered, plain text) · `event_id` uuid (nullable, the "pertaining to" pill) ·
`sent_at` timestamptz default now · `created_at`.
Indexes: `(clerk_user_id, sent_at desc)`, `(to_evaluation_id, sent_at desc)`,
`(campaign_id)`.
Best-effort writes (a logging failure never blocks the actual send — mirrors existing
fail-open patterns).

### New notification-preference columns on `users`
`pref_email_event_logistics` boolean default **true** · `pref_text_event_logistics`
boolean default **true**. (The existing `pref_email_invite_events` / `pref_text_invite_events`
just move UI boxes — no schema change.)

## Variable engine (`src/lib/email-variables.ts`, pure + tested)

- **Catalog** — typed list grouped Attendee / Event:
  - Attendee: `first-name`, `last-name`, `full-name`, `profile-url`, `company-name`,
    `personalized-learnings`.
  - Event: `event-name`, `event-description`, `event-url`, `event-date`, `venue`,
    `attendee-count`.
- **Marker format** in templates: `{{key}}` (and `{{key:max=500}}` when a per-pill char
  cap is set). Reuses the existing chip-serialization idea but with a static catalog
  rather than profile mentions.
- `renderTemplate(template, vars)` — pure substitution: replaces each `{{key}}` (and
  `:max=N` truncation with `…`) from a `Record<key, string>` of already-resolved values;
  unknown/empty → "". HTML-sourced values (`event-description`, `personalized-learnings`)
  are stripped to text **before** substitution.
- `resolveRecipientVars(attendee, event, personalized)` — builds the per-recipient value
  map from `AdminAttendeeRow` + the event row + `getStoredPersonalizedForEvent`. Profile
  URL falls back to `/?find=1`; first/last name from `preferred-name` logic.

## UI

### Compose pill input (`VariableInput`, client)
A custom contenteditable/segmented input rendering variables as **gold pills** (matches
`MentionChipInput` styling), single-line for subject, multiline for body. `@` opens an
autocomplete menu of the catalog (grouped); selecting inserts a pill. Clicking a pill
opens a small popover; pills whose value can exceed 50 chars
(`personalized-learnings`, `event-description`) expose a **"max characters"** field that
writes `:max=N` into the marker. (Reuse the tiptap mention infra only if it's cleanly
adaptable to a static catalog + per-pill config; otherwise a focused custom component —
decided at plan time.)

### "Emails & Texts" section (event page) — between **Attendees** and **Description**
A `CollapsibleSection` (`sectionKey="emails-texts"`) containing:
- **"Send an Email and/or Text"** button → opens the composer.
- **Past communications table** (campaigns for this event): **Sent to** ("12 attendees"
  or the single recipient's name) · **Via** (email / text / both) · **On** (date+time).
  Row click → details (rendered subject/body, recipient list) — a modal/expander.

### Composer
- **Channel** checkboxes: Email · Text (Text disabled/"coming soon").
- **Recipients** — the in-depth table (adapt `ProfilesScoredTable`/attendee admin rows)
  showing each attendee's name, profile/scores, and **email**; per-row checkbox + an
  **"All attendees"** master check. Unmatched attendees show name+email.
- **From** dropdown: `hello@festival.so` · `drodio@festival.so`.
- **Subject** (`VariableInput` single-line) · **Body** (`VariableInput` multiline, plain
  text) · **Signature** block (prefilled from `getEmailSignatureText()`, editable inline;
  edits here are per-send unless saved — saving routes to the existing email-options
  setter).
- **Live preview pane** (right): renders subject+body+signature for the currently-shown
  attendee; ◀ ▶ cycles attendees. An auto-appended **unsubscribe footer**.
- **Send preview to <email>** — renders for the shown attendee, delivers to the typed
  address, not logged.
- **Send now** | **Send on** (date+time picker).

### `/account` changes
- **Notification preferences restructure** (in `AccountSetupForm`):
  - Rename current box → **"Global notifications"**.
  - New **"Event notifications"** box below it (anchor id `event-notifications`):
    move **"Invite me to events I qualify for"** here, add **"Send me event logistics
    (updates, reminders, etc.)"** (email + text toggles, default on →
    `pref_*_event_logistics`).
- **Messages section** (new, below): table of the member's `member_messages`
  (newest first) — **Subject** · **From** · **Date** · **Pertaining to** (an event pill →
  `/events/{slug}`). Row click expands the body inline. Forward-only.

## Sending pipeline (`src/lib/event-email-send.ts`)

`sendCampaign(campaignId)`:
1. Load campaign + recipients; for each recipient resolve vars, `renderTemplate` subject
   + body, append signature + unsubscribe footer.
2. **Opt-out filter:** skip recipients whose `pref_email_event_logistics` is false (when
   the recipient is a claimed member); unmatched/unknown recipients are sent (no account
   to opt out). Respect the existing per-recipient daily rate-limit.
3. `sendRawEmail({ from, to, subject, html })` (plain-text body → minimal HTML wrapper).
4. Write a `member_messages` row per recipient (best-effort); mark the campaign `sent`.
- **Send now:** create campaign (status `sent` on completion) and run inline.
- **Send on:** create campaign `scheduled` with `scheduled_for`; a new
  `/api/cron/event-email-tick` (every 1–2 min, `isAuthorizedCron`, prod-only) drains due
  campaigns with per-recipient error isolation.

### Backfill existing member emails into `member_messages`
Wire a best-effort `logMemberMessage(...)` into the existing member-facing sends
(connection request/pending/intro, event approved/waitlist, endorsement, chat-mention)
so the `/account` Messages list isn't only blasts. Forward-only.

## Permissions & safety
- Compose/send gated by `adminGate()` + `canAccessEvent(eventId)` (any admin on an event
  they can access).
- All variable values + bodies HTML-escaped before HTML wrapping (reuse `escapeHtml`).
- Recipient email validated (`isValidApplicantEmail`) — blocks header injection.
- Unsubscribe footer on every blast.

## API routes (new, `manage_events`/admin-gated)
- `POST /api/admin/events/[id]/emails` — create + send-now or schedule a campaign.
- `POST /api/admin/events/[id]/emails/preview` — send a single test to a typed address.
- `GET  /api/admin/events/[id]/emails` — list this event's campaigns (table).
- `GET  /api/admin/events/[id]/emails/[campaignId]` — campaign detail + recipients.
- `GET  /api/account/messages` — the viewer's `member_messages` (for the account list).

## Testing
- `email-variables`: `renderTemplate` (substitution, `:max=N` truncation, HTML→text strip,
  unknown keys), `resolveRecipientVars` (profile-url fallback to `/?find=1`, name split).
- Campaign render: subject+body for a sample attendee; opt-out filter excludes an
  opted-out member; preview-send isn't logged.
- `/account` query returns the member's messages with the event pill.

## Out of scope / later
- **Text messages** (Twilio) — UI present but disabled; `channel='text'` stubbed.
- Rich-text/HTML email bodies (plain text now).
- Historical email backfill (no stored bodies).

## Build order (phased PRs)
1. **Data model + variable engine + sending lib** (+ tests).
2. **Composer + "Emails & Texts" section** (compose, preview, send-now, send-test).
3. **Scheduling** (cron + send-on).
4. **`/account`** preferences restructure + Messages + backfill logging.

(Each phase ships behind the others; texts remain stubbed throughout.)
