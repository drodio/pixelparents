# feat/trust-safety-and-signup-fixes

Parent feedback (advertising, terms-before-signup, quality control) plus two bugs
from screenshots.

## Progress Update as of [August 5, 2026 — 10:23 AM Pacific]

### Summary of changes since last update

Fixed the "Please sign in first" blocker on the student parent-link step, capped
the thanks-page banner, added terms acceptance at signup, added an automatic
content filter, and built a full enforcement system (mute / ban / delete / note
with durations) plus an admin audit log and per-account enforcement history.
typecheck / lint / test (**978**) / build all exit 0; schema verified against the
production DB.

### Bug 1 — "Please sign in first." (blocked the student flow entirely)

`/signup/thanks?id=<uuid>` is reached BEFORE a member has a Clerk session — the
page is authorized by the secret `?id=` of their own signup row. My
`requestFamilyLinkAction` called `callerSignupId()`, which needs `currentUser()`,
so it always failed there. A student literally could not complete the one step
they cannot skip.

Fix: `requestFamilyLinkAsDraftAction` / `cancelFamilyLinkAsDraftAction`,
authorized by the row UUID — the SAME model `patchSignup`/`patchChild` already
use on that page. Holding the link already grants edit rights, so this adds no
new access. `LinkAccounts` takes an optional `draftSignupId` and picks the right
action, so /family (session) and /signup/thanks (draft id) share one component.

### Bug 2 — the banner. Decision: KEPT, but capped and captioned

It's `/images/banner.webp`, a static photo from a real Pixel event, shown only to
first-time visitors (`!hasExistingData`). At `aspect-[13/5]` full-bleed it ate
most of the desktop fold, pushing the one required action below the scroll, and
an uncaptioned photo of unfamiliar people directly above "Ava, nice to meet you"
reads as though it's supposed to be YOUR photo.

Removing it entirely would make a required-action page feel like a cold form, and
the human warmth is the point of this community. So: capped to `h-36 sm:h-48`,
given a real `alt`, and captioned "OHS families at a Pixel community event". Warm
without competing with the task.

### Detail of changes made:

**Terms acceptance** — `signups.terms_accepted_at` + `terms_version` (self-heal
DDL), `TERMS_VERSION` in `lib/terms.ts`, a required checkbox linking /terms and
/privacy, and the submit button disabled until it's ticked. The sanitizer only
ever SETS acceptance, never clears it — un-accepting would silently erase a legal
record. Storing the VERSION (not a boolean) means we can re-prompt only the
people who haven't seen a materially changed version.

**Content filter** — `lib/content-filter.ts` using `obscenity` rather than a word
list, because a word list is trivially defeated (it catches `fvck`; `.includes()`
would not). Blocks name the trigger: *"Content policies do not permit "x" in your
post."* An unexplained rejection is unactionable and makes a false positive
impossible to report. An ALLOWLIST handles the Scunthorpe problem — "analysis",
"Essex", "assignment", "class", "therapist" all pass, with tests.

**Enforcement** — `enforcement_actions` (mute | ban | delete | note).
`expires_at = NULL` means permanent; a timed action lapses by comparison against
`now()`, so **nothing has to run to un-apply it** — a failed cron can never leave
someone muted forever. `lib/enforcement.ts` is pure and unit-tested (16 tests):
`isActive`, `activeRestriction` (a ban implies a mute), `summarizeHistory`
("banned permanently · 2x mute · 3x delete"), `expiryFromHours`.

**Write guard** — `lib/write-guard.ts` runs restriction THEN content, wired into
`createAskAction`, `updateAskAction` (so editing isn't a bypass) and
`respondToAskAction`. A muted member is told when it lifts, not just "no".

**Admin surfaces** — `/admin/enforcement` (apply an action with a required
reason, recent actions with one-click Lift, and the admin audit timeline) and an
**Enforcement column** on the Parents list, fed by ONE batched query
(`enforcementSummaries`) so it never becomes an N+1. Every action is mirrored to
the shared audit log as `admin.enforcement.*`, so admin activity is queryable
next to everything else and survives deletion of the enforcement row.

### Verification run

- `typecheck` 0, `lint` 0, `test` 0 (**978**), `build` 0. Build shows
  `ƒ /admin/enforcement`.
- Production DB: created `enforcement_actions`, inserted a timed mute AND a
  permanent ban, read the history back, confirmed both `terms_*` columns exist,
  removed the probe rows.

### Potential concerns to address:

- **Nothing here is browser-verified yet.** The enforcement UI, the terms
  checkbox and the content-filter message are all untested by a human. The terms
  checkbox in particular now GATES the submit button — if it mis-renders, signup
  is blocked again. Test that first after deploy.
- The write guard covers community asks/replies. **Resource boards and
  contributions are NOT yet guarded** — a muted member could still post there.
  Same one-line `guardWrite` call; just not done.
- Student ability verification was deliberately skipped per your call.
- The filter is English-only. This community includes WeChat-using families, so
  non-English abuse would pass. Worth knowing before relying on it.
- `revokeEnforcement` has an awkward two-step (Drizzle `eq(col, null)` doesn't
  emit `IS NULL`); it works but should be rewritten with `isNull()`.
- The approval-queue fix from the audit (making student-email verification the
  obvious path) is still NOT done — that remains the biggest growth blocker.
