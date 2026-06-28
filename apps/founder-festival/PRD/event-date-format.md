# Event-date variable: clickable date-format picker

## Progress Update as of 2026-06-19 1:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev's review of f506a00 (job 83, 1 Low finding): the marker regex's
modifier-value group had widened to `[a-z0-9]+` for BOTH `max` and `fmt`, so a malformed
`{{x:max=abc}}` would match as an uncapped max instead of staying literal. Switched to
separate alternatives `(?::max=(\d+)|:fmt=([a-z0-9]+))?` in both `renderTemplate`
(email-variables.ts) and `MARKER` (email-template-doc.ts) so `max` stays digits-only.
Tests + tsc still green (24 passing across the 3 touched suites).

## Progress Update as of 2026-06-19 1:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
In the event "Emails & Texts" composer, the **Event date** pill is now clickable to
choose its display format (like the existing "click a long variable to cap its length").
Three **date-only** formats (no time, per owner): **Monday, June 1st** (default),
**June 1st**, **6/1/26**.

### Detail of changes made:
- `src/lib/email-variables.ts`:
  - `formatEventDate(startsAt, fmt?)` now returns DATE-ONLY (no time, dropped the
    " … at 6:00 PM PT"): `weekday` "Monday, June 1st" (default), `monthday` "June 1st",
    `numeric` "6/1/26". Added `ordinalDay()`, `EventDateFormat`, `EVENT_DATE_FORMATS`,
    `DEFAULT_EVENT_DATE_FORMAT`, `isEventDateFormat`. `event-date` def gains `canFormat`.
  - Marker grammar extended: `{{key}}` / `{{key:max=N}}` / `{{event-date:fmt=<id>}}`.
    `renderTemplate(template, values, opts?)` takes `opts.eventStartsAt` and computes the
    chosen format from the raw start date on demand (falls back to the resolved value if
    no date is supplied). Single render path → preview == sent.
- `src/lib/email-render.ts`: `renderForRecipient` passes `eventStartsAt: event.startsAt`
  to both subject + body `renderTemplate` calls.
- `src/lib/email-template-doc.ts`: parses the `:fmt=` modifier into a new pill `fmt` attr.
- `src/components/admin/email/VariablePillInput.tsx`: pill node gains a `fmt` attr;
  `renderText` serializes `{{event-date:fmt=<id>}}`; the Event-date pill opens a
  format-picker popover (3 options, shows a ✓ on the active one) and displays the active
  format example next to the label. Catalog dropdown shows a "formattable" hint.
- `src/components/admin/email/EmailComposer.tsx`: updated the Body helper text.
- Tests updated: `tests/lib/email-variables.test.ts` (formats + `:fmt=` rendering),
  `tests/lib/email-template-doc.test.ts` (`:fmt=` round-trip, `fmt` attr on pills).

### Potential concerns to address:
- **Behavior change:** bare `{{event-date}}` no longer includes the time (it now renders
  "Monday, June 1st"). This is intended (owner: "no time in any of the options"), but any
  already-scheduled campaign using `{{event-date}}` will send without the time.
- The popover interaction wasn't headlessly click-tested (admin-auth UI); logic is
  unit-tested and mirrors the existing max-cap popover. Worth a quick click-test in prod.
- Default format is `weekday`; trivial to change `DEFAULT_EVENT_DATE_FORMAT` if desired.
