# fix/signup-friction-and-blocked-save

Triggered by a screenshot from Ava testing the signup flow as a **Current OHS
student**: the form showed `⚠ Couldn't save — click to retry`, with the
"Stanford OHS affiliation" question re-asking the role she'd already picked at
the top of the form.

## Progress Update as of [August 1, 2026 — 9:46 PM Pacific]

### Summary of changes since last update

Two signup-friction fixes. Removed a duplicated required question for students
and alums, and made the autosave-failure state explain itself instead of being an
unrecoverable dead end. typecheck / lint / test (879) / build all exit 0.

### Diagnosis — what the save error was NOT

Worth recording, because two plausible theories were wrong and cost time:

1. **NOT the `wechat_id` column.** First instinct was the repo's known P0 pattern
   (a new column with no migrate-on-deploy — the `country` incident). Checked:
   the signup save path genuinely never calls `ensureFamiliesSchema()`, which
   looked damning. But the column DOES exist in production (a read path runs the
   DDL via `getSignupByEmail`), and a no-op `UPDATE signups SET wechat_id = NULL`
   against the production DB succeeds. So the batch-1 WeChat work is not the cause.
2. **NOT a prod-vs-dev database split.** Briefly concluded prod and local were
   different databases by comparing a Vercel API value against `.env.local` — but
   the API returns `DATABASE_URL` as an ENCRYPTED blob, so that was ciphertext vs
   plaintext. `vercel env pull --environment=production` proves they are the SAME
   Neon instance (`ep-calm-frost-ahqde7ue-pooler`). Don't repeat that comparison.

The actual remaining candidate is a **BotID block on `createDraftSignup`**
(`checkBotId()` → `{error:"blocked"}`), which is exactly what a VPN / private
relay / ad-blocker triggers.

### Detail of changes made:

- **Autosave failure now explains itself.** `draftErrorMessage()` already
  distinguished `blocked` (bot-check/VPN/ad-blocker — NOT transient) from
  `failed` (transient), but it was only wired into the submit (line ~369) and
  invite (line ~257) paths. The autosave-error UI showed a bare
  "Couldn't save — click to retry" with no reason, so a blocked user retries
  forever with no idea why. The reason now renders under the retry button.
  - This required a new `ensureErrorView` **state** mirroring the `ensureError`
    **ref**. The ref must stay: `onContinue` reads the reason synchronously right
    after `await ensureId()`, before a state update would flush. But a ref can't
    drive render — `react-hooks/refs` correctly errored on reading `.current`
    during render, and a ref change wouldn't re-render anyway. Both are now set
    together at all three assignment sites.
- **Students and alums are no longer asked their OHS affiliation.** It duplicated
  "Who's signing up?" with overlapping options (Ava's doc flagged this too: "not
  sure if the questions above are relevant to student or ohs alum").
  - `lib/options.ts`: new `PARENT_AFFILIATIONS` (sliced from `OHS_AFFILIATIONS`,
    never retyped), `STUDENT_AFFILIATION`, `ALUM_AFFILIATION`, a module-level
    order guard that throws if the canonical list is reordered, and a pure
    `affiliationForRole(role)` helper.
  - `signup-form.tsx`: `setAccountType` derives AND persists the affiliation in
    the same save as the role, so the now-hidden field is always populated before
    `completeSignup` validates it. Switching back to parent clears it (returns
    `""`) rather than silently submitting a student affiliation.
  - The question renders only for parents / co-parent-join, and now lists **3**
    options instead of 5 — the student/alum entries were noise in a parent's picker.
  - 5 new tests in `lib/options.test.ts` pin the derivation, including that every
    derived value is a member of the enum `completeSignup` validates against.

### Verification run

- `typecheck` 0, `lint` 0, `test` 0 (73 files / **879** tests), `build` 0.
- Browser, real clicks (not synthetic — see below):
  - student → section reads "Your info", affiliation question **absent**
    (0 radios), builder question still asked
  - parent → "First parent's info", affiliation **asked**, exactly the 3 parent
    options
- **Testing gotcha:** a programmatic `element.click()` on these controlled radios
  flips the DOM `checked` but does NOT fire React's `onChange`, producing a
  DOM/state desync that reads as a broken feature. Use the harness's real click.
  Separately, one browser tab wedged at `innerWidth/innerHeight = 0`, which made
  `read_page` return an empty tree and coordinate clicks silently miss — opening
  a fresh tab fixed it.

### Potential concerns to address:

- **The save failure is not confirmed fixed** — only made diagnosable. If Ava was
  BotID-blocked she'll now see the VPN/ad-blocker message and can act on it; if
  the cause is something else, the generic message appears and we still need her
  to say what it now reads. Ask her to re-test and report the new text.
- Could not reproduce the failure locally: `createDraftSignup` is BotID-gated and
  no draft is created in the local dev environment, so no save ever fires.
- Vercel runtime logs were unavailable — the MCP integration returns
  `403 Forbidden` for this project's logs, so the production error string behind
  `console.error("patchSignup failed:", err)` was never read. Getting log access
  would have made this diagnosis minutes instead of a process of elimination.
- Existing signups keep whatever `ohs_affiliation` they already had; nothing
  backfills students/alums who previously answered inconsistently.
- The admin edit form still offers all 5 affiliations, which is intended (an
  admin may need to correct any row) but is now inconsistent with signup.
