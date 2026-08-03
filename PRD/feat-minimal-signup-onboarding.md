# feat/minimal-signup-onboarding

Two asks: diagnose the reported signup save failure, and cut account creation
down to the basics so profile-building happens afterwards instead of as a wall
of fields up front.

## Progress Update as of [August 2, 2026 — 7:33 PM Pacific]

### Summary of changes since last update

**Signup was verified working end-to-end on production before any changes were
made** (full student signup completed, reached /signup/thanks, zero errors).
Then cut `/signup` from ~1150 lines and 6 sections down to ~440 lines and 2
sections — role + name + email + phone — and added a precise "finish your
profile" nudge on the dashboard. typecheck / lint / test (**909**) / build all
exit 0.

### The save failure — reproduced the whole flow on PRODUCTION, it works

This is the third attempt at this bug and the first with real evidence:

- Drove the **live production form** at gopixel.org/signup in a browser with real
  clicks and real typing. Filled the student path completely, submitted, and it
  advanced to `/signup/thanks` with **no error**. Created row was deleted afterwards.
- Confirmed while doing it that the earlier fixes ARE live in production: the
  info section reads **"Your info"** for a student, and the duplicated
  "Stanford OHS affiliation" question is **gone**.
- The `POST /signup → 200 [net::ERR_ABORTED]` pairs in the network log are
  **normal** — Next.js aborts superseded in-flight server actions. Not an error.
- **BotID does not block in dev.** `checkBotId()` returns
  `{isHuman: true, isBot: false}` whenever `NODE_ENV !== "production"` (read the
  library source). So no bypass should ever be added for testing, and BotID was
  never why a local repro failed.

Conclusion: the current build signs up fine. Ava's report was against the older
build, or is environment-specific (a bot-check block on her network — which #194
now explains to the user instead of showing a bare retry).

### Detail of changes made:

**`/signup` is now account creation only.**

- Removed four whole sections: *Where you're based*, *Interests & photos*,
  *Stanford OHS & building together* (affiliation + builder interest), and
  *Invite a co-parent*. Also removed LinkedIn / WeChat / personal website / the
  enrichment opt-in / the student-resource prompt from *Your info*.
- **This is safe deletion, not lost functionality**: `app/(authed)/family/
  member-card.tsx` already edits every one of those fields (city, state,
  linkedinHandle, wechatId, websiteUrl, ohsAffiliation, parentInterests, phone,
  githubUsername). Photos + share settings already live on `/signup/thanks`.
- `lib/validation.ts`: `ohsAffiliation` is now **optional**. It was the one
  removed field that `completeSignup` hard-required, so leaving it required would
  have made the trimmed form impossible to submit. Students/alums never answer it
  anyway (derived from role), so in practice only a parent leaves it blank, and
  only until they finish their profile.
- Cleaned out everything the removal orphaned: 6 unused option imports,
  `TagPicker`/`PhotoUploader`/`CityAutocomplete`/`City`, `parseInviteEmails`,
  `sendCoParentInvites`, `legendCls`, `prefixWrapCls`, `suggestedInterests` (and
  its two call sites), plus `onInviteClick`, `onConfirmInvite`, `setCountry`,
  `pickCity`, `setBuilderInterest`, `toggleSkill`, `setLinkedin`,
  `setStudentResource` and the now-unreachable co-parent confirm dialog.

**Finish-your-profile nudge.**

- New `lib/profile-completeness.ts` → `profileGaps(row)` returns the specific
  gaps, so the dashboard says "Add your interests" rather than a vague "complete
  your profile", and the card disappears by itself once nothing is left.
- Deliberately scoped to fields that make the directory + interest matching work
  (interests, location, affiliation). LinkedIn/WeChat/website/photos are NOT
  nudged — badgering someone forever about a field they may never want is worse
  than not nudging.
- Never nudges a student or alum about affiliation, since theirs is derived and
  they have no way to act on it.
- Location accepts **country OR city** — never demands both.
- 7 tests in `lib/profile-completeness.test.ts`.

### Verification run

- `typecheck` 0, `lint` 0 (zero warnings), `test` 0 (**909**), `build` 0.
- Production, pre-change: full student signup completed successfully.
- Trimmed form renders locally with exactly 2 sections and 4 fields.

### Potential concerns to address:

- **The trimmed form has NOT been exercised end-to-end yet.** The local attempt
  was inconclusive: injecting values via a native setter + `input` event does not
  fire React's `onChange` for these controlled inputs, so nothing was queued, and
  the `pp_signup_draft_id` in localStorage was stale from an earlier test.
  **Re-run the production pass with real typing after this deploys** — that is
  the method that actually worked.
- `ohsAffiliation` going optional means existing consumers may now see null where
  they previously always had a value. Grep before assuming it's set.
- The submit button still reads "Add Your Child(ren) →" / "Add Your Parent →" —
  accurate (that IS the next step) but arguably "Create account →" is clearer now
  that this page is only account creation. Left alone as a copy decision.
- Co-parent invites are no longer offered during signup. They still exist on
  `/signup/thanks` (`ThanksInviteCta`) — worth confirming that's discoverable
  enough, since it used to be inline.
- The nudge links everything to `/family`. That page is a full editor, not a
  guided flow, so it satisfies "accessible again" better than it satisfies
  "onboarding experience". A stepped first-run walkthrough is still open.
