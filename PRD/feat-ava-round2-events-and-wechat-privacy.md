# feat/ava-round2-events-and-wechat-privacy

Second round of parent feedback from Ava:

1. A filled-in review doc, **"GoPixel — OHS Events: Online/In-Person Review
   (2026–27)"**, covering all 21 OHS school-calendar entries with the correct
   classification for each.
2. On the WeChat share question: *"for number three make it like the phone number
   so they have option to keep priv[ate]"*.

## Progress Update as of [August 1, 2026 — 10:56 PM Pacific]

### Summary of changes since last update

Implemented Ava's full event table (holidays/breaks are no longer mislabelled as
"Online"), gave WeChat its own privacy toggle instead of riding the phone one,
and conclusively ruled the database out as the cause of her signup save error.
typecheck / lint / test (**902**) all exit 0.

### Detail of changes made:

**Events — the online/in-person split was the wrong question for most entries.**
Ava's review made the real problem clear: holidays and breaks are CLOSURES, not
events, so tagging them "Online" is meaningless, and finals genuinely run both
ways. Replaced the boolean with a 5-way classifier.

- `lib/events/ohs-parser.ts`: new `classifyOhsEvent(title) -> OhsEventKind`
  (`holiday` | `break` | `in_person` | `hybrid` | `online`). `isOhsEventOnline()`
  is now derived from it, so the stored `is_online` flag (and therefore the
  existing online/in-person FILTER) keeps working unchanged.
  - **Order matters:** closures are checked BEFORE campus hints, so a
    hypothetical "Graduation Holiday" reads as a holiday, not an in-person event.
    There's a test for exactly this.
  - Added `homecoming` + `pixel gathering` to the in-person hints — Homecoming
    was the one genuinely in-person entry the original list failed to catch, and
    Ava flagged it.
- `app/(authed)/events/event-bits.tsx`: `PlaceBadge` renders the new kinds for
  `source === "ohs"` only — **Holiday** / **Break** (amber, calendar icon) and
  **Online & in person** (violet) — falling through to the existing
  Online/In-person logic otherwise. **User-created events are completely
  untouched**; they still use the plain `isOnline` flag.
- `lib/events/ohs-parser.test.ts`: **all 21 of Ava's rows are now a test table.**
  That doc IS the spec — if a rule changes, a row fails rather than a badge
  silently going wrong. 39 tests in that file now.

**WeChat privacy — its own toggle, not the phone one.**

- Ava asked for phone-like behavior, meaning independently controllable. Batch 2
  had gated WeChat on `visible.has("phone")`, which meant you couldn't share a
  phone but hide WeChat, or vice versa.
- `lib/share.ts`: new `{ key: "wechat", label: "WeChat ID" }` in `SHARE_FIELDS`.
- **It IS in `DEFAULT_SHARE_FIELDS`, deliberately breaking the "new fields stay
  off" convention.** That rule exists to stop a PRE-EXISTING member's already
  stored data from suddenly appearing — but `wechat_id` is a brand-new column, so
  no existing member has one. The only people affected are those who deliberately
  typed a WeChat ID in, and silently never showing it is the write-only problem
  batch 2 just fixed. It stays independently toggleable off.
- `components/profile-view.tsx`: gate is now `visible.has("wechat")`, and
  `showContact` includes it so a member sharing ONLY WeChat still gets a Contact
  block.
- The settings UI maps over `SHARE_FIELDS`, so the new toggle appears with no
  further wiring.

### On the signup save error (Ava's screenshot) — DB conclusively ruled out

- **BotID does NOT need disabling for local testing.** Read the library source:
  `checkBotId()` returns `{isHuman: true, isBot: false}` whenever
  `NODE_ENV !== "production"`. It never blocks in dev, so it was never the reason
  a local repro failed, and no bypass should be added.
- Ran a direct probe against the production database: created a draft family +
  signup row, applied the exact column set the STUDENT path now writes (including
  `wechat_id` and the derived `ohs_affiliation`), then deleted both rows. It
  **succeeded**. The DB/schema layer is definitively not the cause.
- Since BotID *does* run in production and *can* return `isBot: true`, a
  production bot-check block remains the leading hypothesis — and PR #194 now
  surfaces that to the user with an actionable message instead of a bare retry.

### Verification run

- `typecheck` 0, `lint` 0, `test` 0 — 73 files, **902** tests.
- The 21-row event table passes exactly as Ava specified it.

### Potential concerns to address:

- **Not visually verified.** The events badge and the WeChat toggle are both
  behind auth. Worse, the browser preview repeatedly wedged at
  `innerWidth/innerHeight = 0` (making `read_page` return an empty tree and
  coordinate clicks silently miss), so even the signup page couldn't be
  re-checked this round. Opening a brand-new tab is the workaround when it happens.
- Existing OHS rows keep their stored `is_online` until the next sync. The BADGE
  is computed from the title at render time, so holidays/breaks fix themselves
  immediately — but Homecoming won't flip to in-person in the *filter* until a
  sync re-runs the importer.
- Ava also asked whether holidays/breaks should carry a **location** tag
  (Homecoming) and whether closures should appear on the calendar at all. Not
  addressed — worth a decision rather than a guess.
- The `hybrid` kind has no DB representation; it's title-derived only. If someone
  later wants to FILTER for hybrid events, that needs a real column.
- Community-created events were out of scope for Ava's review (they live only in
  the DB, not the repo), so their tags are unaudited.
