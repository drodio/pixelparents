# Branch: `prefs-table-redesign` — progress log

Branched from `main` (post PR #41).

## Progress Update as of 2026-05-26 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Redesigned `/account/setup` per QA:
- Container widened from `max-w-md` (448px) to `max-w-2xl` (672px) so
  the email + phone cards can sit side-by-side on desktop and a
  preference table can fit underneath.
- The two contact-method cards (Email, Phone) shrunk to verification-
  only — toggles are NO LONGER inside them.
- A new "Notify me when…" preference table sits below both cards
  with 5 rows × 2 channel columns (Email, Text):
    1. Invite me to events I qualify for
    2. Send me occasional Festival updates
    3. Introduce me to high-signal investors  *(new)*
    4. Introduce me to high-signal founders   *(new)*
    5. Introduce me to sponsors I could benefit from
  Each toggle saves independently.
- The whole row stack renders at reduced opacity + inert until BOTH
  email AND phone are verified. Header copy tells the user which one
  to verify. Once both are verified, toggles snap to actual values
  and become interactive.

### Schema
10 new boolean columns on the `users` table:
- pref_email_invite_events (true)        pref_text_invite_events (true)
- pref_email_festival_updates (true)     pref_text_festival_updates (false)
- pref_email_investor_intros (true)      pref_text_investor_intros (false)
- pref_email_founder_intros (true)       pref_text_founder_intros (false)
- pref_email_sponsor_intros (true)       pref_text_sponsor_intros (false)

Defaults follow the spec: email=true on all five, text=true only on
invite_events. Legacy `pref_invite_events / festival_updates /
sponsor_intros / text_alerts` columns kept around (the schema still
includes them) to avoid a destructive migration — no code writes them
anymore.

Migration `drizzle/0006_nasty_mauler.sql` applied to both Neon
branches via the API. (Idempotent — first dev attempt had 3 statements
fail on a transient Neon connect timeout; retried successfully.)

### API changes
`/api/account/preferences`:
- GET returns all 14 keys (4 legacy + 10 new). Defaults match the
  schema defaults when no users row exists yet.
- POST accepts any subset of the 14 — new UI only ever sends one key
  at a time (optimistic update + roll back on failure).

### UI changes
`src/components/AccountSetupForm.tsx`:
- `PREF_ROWS` array drives the table; one entry per (label, emailKey,
  textKey).
- `PreferencesTable` component renders the 3-column grid with a
  header row.
- `Toggle` simplified — no more "force visual to on while disabled"
  hack since the toggle now shows the actual saved value with
  `opacity-40 cursor-not-allowed` when disabled.
- EmailCard + PhoneCard no longer render their old bottom-of-card
  toggle blocks.

### Potential concerns:
- The legacy `pref_invite_events / festival_updates / sponsor_intros
  / text_alerts` columns now have a stale value forever. Future
  cleanup: drop them once we're confident nothing reads them.
- The "Introduce me to high-signal investors / founders" categories
  don't yet have any plumbing on the SEND side (no email or SMS jobs
  consume them). Capturing the preference now means we can build the
  send paths later without re-prompting users.
