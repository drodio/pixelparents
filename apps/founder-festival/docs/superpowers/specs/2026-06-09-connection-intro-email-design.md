# Connection Introduction Email — Design

**Date:** 2026-06-09
**Status:** Approved design (user approved in chat), pending implementation plan
**Branch:** `connection-intro-email`

## Problem

Today, when an event connection request is **approved**, the requester gets the
other person's raw email + LinkedIn revealed in the attendee-directory UI
(`getEventDirectory` returns a `contact` object when `connectionStatus ===
"approved"`). **No email is sent on approval.**

New behavior: on approval, **don't reveal raw contact** — instead send a
double-opt-in **introduction email to both people** (one email addressed to
both, so either can reply-all to start talking), with their Festival profile
links and a link to the event they both attended.

## Behavior changes

1. **Stop revealing raw contact on approval.** In `getEventDirectory`, change the
   reveal condition from `mode === "open_to_all" || connectionStatus ===
   "approved"` to **`mode === "open_to_all"`**. The deliberate "open to all"
   contact-sharing mode is unchanged; only the approval-driven reveal is removed.
2. **Send an intro email on approval**, from both approval code paths.
3. **Copy updates** so messaging matches the new flow:
   - `ConnectionRespond` success line: "Approved — your email and LinkedIn will be
     shared with them." → "Approved — we've emailed an intro to you both."
   - `sendConnectionRequestEmail` body line: "If you approve, <name> will see your
     email and LinkedIn." → "If you approve, we'll email an intro to you both."

## The email

Sent via Resend (like the existing connection emails). **From:** the existing
`Founder Festival <hello@festival.so>` (`FROM` in `src/lib/email.ts`). **To:**
**both** people (`to: [emailA, emailB]` — Resend accepts an array), so a reply-all
connects them directly.

- **Subject:** `Festival: Connecting <NameA> ←→ <NameB> from <EventTitle> on <Date>`
- **Body (HTML):**
  ```html
  <p><NameA> &amp; <NameB>, you both wanted to connect from
     <a href="<eventUrl>"><EventTitle></a> on <Date>. Here are your profiles:</p>
  <ul>
    <li><a href="<profileUrlA>"><NameA></a></li>
    <li><a href="<profileUrlB>"><NameB></a></li>
  </ul>
  <p>Hope it's a valuable connection!</p>
  <p>#Velocity,<br>DROdio</p>
  ```
- **NameA / NameB:** requester (`fromEvaluationId`) first, approver
  (`toEvaluationId`) second. HTML-escaped (names are user-supplied — use the
  existing `escapeHtml`).
- **`<Date>`:** the event's `startsAt`, date-only, America/Los_Angeles, e.g.
  "June 3, 2026" (`toLocaleDateString("en-US", { month: "long", day: "numeric",
  year: "numeric", timeZone: "America/Los_Angeles" })`).
- **`<eventUrl>`:** absolute `<origin>/events/<slug>` (event name is the clickable
  link, per the request).
- **`<profileUrlA/B>`:** absolute `<origin>` + the profile path. Path resolved
  from `evaluations.slug` / `evaluations.slugKind` via `profileUrlFor`
  (`/profile/<kind>/<slug>`, else `/profile?e=<evalId>` fallback — always
  resolvable). The person's **name** is the link text.

## Recipient resolution

Both parties are event attendees (the requester connected from the event
directory), so each has an `eventAttendees.email` for this event. Best email per
person: **`eventAttendees.email` for this event, falling back to
`evaluations.foundEmail`**. If **either** person has no resolvable email, **skip
the send** (log a warning) — the approval is still recorded; we just can't
introduce. Dedupe if both resolve to the same address.

## Architecture / hook point

Both approval paths set `status = "approved"` on the `connectionRequests` row:
- email-token page → `POST /api/connections/respond` → `decideConnectionRequestByToken`
- in-app inbox → `POST /api/connections/decide` → `decideConnectionRequest`

Add one shared async helper **`introduceConnection(requestRow, origin)`** (in
`src/lib/attendee-connections.ts`) that loads the event + both people, resolves
emails + profile URLs, and sends the intro. Both routes call it **after a
successful approve** (`row && row.status === "approved"`), wrapped in
try/catch so a mail failure never blocks the approval response (same best-effort
pattern as the request-creation email in `/api/events/[slug]/connect`). `origin`
comes from `new URL(req.url).origin`.

The pure email construction lives in `src/lib/email.ts`:
- `buildConnectionIntroEmail(opts) → { subject, html }` (pure, escapes names) —
  unit-testable without sending.
- `sendConnectionIntroEmail(opts) → Promise<{ id }>` — builds + sends to both
  recipients via `client().emails.send({ from: FROM, to: [a, b], subject, html })`.

## Files

- **Modify** `src/lib/email.ts` — add `buildConnectionIntroEmail` (pure) +
  `sendConnectionIntroEmail`; tweak `sendConnectionRequestEmail`'s "will see your
  email and LinkedIn" line.
- **Modify** `src/lib/attendee-connections.ts` — remove the `approved` reveal in
  `getEventDirectory`; add `introduceConnection(requestRow, origin)`.
- **Modify** `src/app/api/connections/respond/route.ts` and
  `src/app/api/connections/decide/route.ts` — call `introduceConnection` after a
  successful approve (best-effort).
- **Modify** `src/components/events/ConnectionRespond.tsx` — success copy.
- **Test** `tests/app/connection-intro.test.ts` (or extend an existing
  connections test) — unit-test `buildConnectionIntroEmail`; integration-test
  `introduceConnection` recipient resolution with a mocked sender.

No schema change. No migration.

## Data flow

```
Approve (token page OR in-app inbox)
  → decideConnectionRequest*(...) sets status=approved, returns row
  → route calls introduceConnection(row, origin)  [try/catch, best-effort]
      → load event (title, slug, startsAt)
      → load both people (fullName, slug, slugKind, eventAttendees.email, foundEmail)
      → resolve emails (eventAttendees.email ?? foundEmail); skip if either missing
      → buildConnectionIntroEmail(...) → { subject, html }
      → Resend send  from=hello@festival.so  to=[emailA, emailB]
  → directory no longer reveals raw contact for approved (intro email is the channel)
```

## Testing

- **Unit (pure, node):** `buildConnectionIntroEmail` — subject contains both
  names + event title + date; body links the event name to `<eventUrl>`, lists
  both profile links with names as text, includes "Hope it's a valuable
  connection!" and the "#Velocity,<br>DROdio" sign-off; a name with `<`/`&` is
  escaped.
- **Integration (DB, mocked sender):** `introduceConnection` — seed event + two
  attendees with emails + an approved request; assert the sender mock is called
  once with both resolved emails in `to`; assert it **skips** (sender not called)
  when one attendee has no email; both with `describe.skipIf(IS_PROD_DB)`.
- **Reveal change:** assert `getEventDirectory` no longer returns `contact` for an
  approved connection (only for `open_to_all`).

## Open risks / notes

- **Both must have email:** if either lacks one, no intro is sent and no contact
  is revealed either — the connection is approved but silent. Acceptable for v1
  (attendees almost always have an RSVP email); logged for visibility.
- **Reply-all etiquette:** From is the festival address; a reply-all reaches the
  festival address + the other person. That's the intended "warm intro" channel.
- **Idempotency (required):** `decideConnectionRequestByToken` already only flips a
  *pending* row (returns null otherwise), so a re-clicked token link won't re-send.
  `decideConnectionRequest` (in-app) currently updates regardless of current
  status — **add `eq(connectionRequests.status, "pending")` to its update
  `where`** so it too only acts on a genuine pending→decided transition and
  returns null on a repeat. Then both routes safely gate the intro on "the decide
  function returned a row whose status is now approved," guaranteeing exactly one
  intro per request.
