## Progress Update as of [June 30, 2026 — 9:32 PM Pacific]

### Summary of changes since last update
First entry for this branch. Added a one-tap "Report this bug to the team" button
(with a confirmation dialog) to BOTH error screens — the route-level boundary
(`app/error.tsx`) and the bare root boundary (`app/global-error.tsx`) — plus a
best-effort server endpoint that persists the report into the existing
`/admin/reports` triage as category `auto-error`. Reused `createReport` as-is; no
schema/DB changes.

### Detail of changes made
- **New endpoint `app/api/report-error/route.ts`** (`runtime="nodejs"`,
  `dynamic="force-dynamic"`). POST body `{ url, message, digest }`. Resolves the
  reporter server-side via Clerk `currentUser()` (wrapped in try/catch — may be
  null/unavailable on a hard error, esp. from `global-error` which has no
  providers), derives label via `lib/clerk.ts`'s `primaryEmail()` (falls back to
  the Clerk user id, else "signed-out"). Calls `createReport` with category
  `auto-error`, a concise assembled message, and `sourcePath = url`. NEVER throws
  back to the client — always returns `{ ok: true }`; DB failure is only
  console-logged.
- **New pure helper `app/api/report-error/message.ts`** — `buildErrorReport()`
  assembles the stored message from url/message/digest + reporter label + client
  IP. All attacker-influenced strings are control-char-stripped, whitespace-
  collapsed, and length-capped (error 500 / digest 120 / url 500 / label 254) so
  no secrets or runaway text land in triage. `contactEmail` is only set when the
  reporter label looks like an email (`looksLikeEmail`, mirrors
  `app/report/actions.ts`). Extracted specifically so it's unit-testable without
  Next/DB/Clerk.
- **New test `app/api/report-error/message.test.ts`** — 7 cases covering message
  assembly, signed-out fallback, non-email labels, blank/missing fields,
  newline/control-char collapsing + runaway capping, hostile non-string body
  types, and `looksLikeEmail`.
- **New client component `components/error-report-button.tsx`** — self-contained
  (NO app providers / Clerk / server action / globals.css): plain `fetch` to
  `/api/report-error`, inline styles, on-theme (black/amber). Phases
  idle→confirming→sending→done. Confirmation dialog states clearly: "This will
  share the page URL, basic error info, and your account with the site's
  administrators." with Cancel / Send. Accessible: `role="dialog"`,
  `aria-modal`, labelled/described, Escape closes, focus moved to Send on open +
  restored to opener on close, rudimentary Tab containment, backdrop-click
  cancels. On send shows "Thanks — reported." (`role="status"`). Safe in the bare
  `global-error` tree.
- **`app/error.tsx`** — renders `<ErrorReportButton error={error} />` in a
  `fixed` bottom-center overlay layered over the shared `ErrorScreen` (did NOT
  modify `components/screens/error-screen.tsx`, which is out of scope). Kept the
  existing Try-again/reset and the `Reference: {digest}` line.
- **`app/global-error.tsx`** — wrapped the existing Reload button + the new
  report button in a flex row; passes `error` through. Kept Reload/reset and the
  `Reference:` line.
- `lib/db/reports.ts` UNCHANGED — reused `createReport` as-is.

### Potential concerns to address
- Verified via `npx tsc --noEmit` (clean), `npm run lint` (clean), `npm test`
  (780 passed incl. the 7 new). Did NOT run `next build` in the worktree (per
  instructions). In-app browser verification was attempted via the preview
  harness but the preview browser could not reach the local dev server
  (persistent `chrome-error://` despite the server returning 200 to curl) — an
  environment limitation, not a code issue. The button is pure client React with
  inline styles and no runtime deps, so behavior is covered by types + the unit
  suite for the load-bearing assembly logic.
- The endpoint is unauthenticated by design (must work when Clerk context is
  gone). There is NO rate limit on it yet (unlike the landing form). Low risk
  since it only inserts a size-capped `auto-error` row, but a future wave could
  add a best-effort per-IP limiter mirroring `app/report/actions.ts`.
- `contactEmail` is populated only when the reporter is signed in with an
  email-shaped primary address; signed-out reports store "signed-out" and a null
  contact, which is intentional.
