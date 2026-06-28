# email-draft-autosave

## Progress Update as of 2026-06-22 07:34 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The event email composer now autosaves an unsent draft to `localStorage` (per event)
and restores it on refresh / reopen. The draft is cleared automatically once the email
is sent or scheduled, and there's a "Discard draft" affordance to abandon it manually.

### Detail of changes made:
- New pure module `src/lib/email-draft.ts`: `draftStorageKey(eventId)` (`ff:email-draft:<id>`),
  `EmailDraft` type, `isDraftEmpty`, `serializeDraft`, and a defensive `parseDraft`
  (tolerates partial/corrupt/older shapes; only accepts well-typed fields).
- `EmailComposer.tsx`:
  - The composer only mounts on a user click (never server-rendered — see EmailsTextsPanel
    `{composing && <EmailComposer/>}`), so each field's `useState` lazy-initializes from the
    saved draft. No load effect → no hydration mismatch and no `set-state-in-effect` lint.
  - A single save effect writes the draft on every change (removes the key when empty).
  - `clearDraft()` wipes storage + resets the composed fields (From + signature kept). Called
    on successful send/schedule and by the "Discard draft" button.
  - Header shows "Draft restored · autosaves as you type" / "Autosaves as you type".
  - Persisted fields: from, bcc, subject, body, signature, selected recipients, schedule
    mode + time. (previewEmail is intentionally not persisted.)
- Tests: `tests/lib/email-draft.test.ts` (7) — key namespacing, emptiness rules,
  round-trip, parse defensiveness. tsc + lint clean; full email suite (40) green.

### Potential concerns to address:
- Drafts are device/browser-local (localStorage), not synced across devices — matches the
  "save on the page" ask, but worth noting if cross-device drafting is ever wanted.
- A restored `selected` set may include emails no longer in the attendee list; harmless
  (the selected list is intersected with current attendees when rendering/sending).
- No size cap on the body, but localStorage quota errors are swallowed (autosave is
  best-effort), so a huge draft simply stops persisting rather than breaking the composer.
