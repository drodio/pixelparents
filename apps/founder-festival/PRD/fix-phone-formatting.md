## Progress Update as of 2026-05-28 04:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Recolored the breadcrumb "Profile" link to amber-400 (the gold tone the codebase already uses for attention UI). Hover lightens to amber-300.

### Detail of changes made:
- `src/app/(authed)/account/page.tsx`: breadcrumb "Profile" link now uses `text-amber-400 hover:text-amber-300`. User preference is for amber as the link color going forward; sitewide sweep is deferred until explicit ask.

### Potential concerns to address:
- User stated "anything that is a link should be gold." Currently only applied to the breadcrumb. Sitewide sweep would touch many UI surfaces (admin tables, claim modal, leaderboard, etc.) and should be its own PR.

## Progress Update as of 2026-05-28 04:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Adds a "Profile › Account" breadcrumb to the top-left of the /account page, next to the Founder Festival logo. "Profile" is a link back to the user's canonical profile URL.

### Detail of changes made:
- `src/app/(authed)/account/page.tsx`: header now renders the logo and the breadcrumb in a left-aligned flex container. Breadcrumb uses `nav aria-label="Breadcrumb"` and `aria-current="page"` on the current segment. Separator is `›` (right single guillemet) wrapped in `aria-hidden`.
- The breadcrumb's "Profile" target is resolved server-side via a new `loadMyProfileUrl(clerkUserId)` helper that joins `users` + `evaluations` and feeds the result through the existing `profileUrlFor()` helper. Unclaimed users (no `users` row) get `/` as the fallback target.

### Potential concerns to address:
- **Bundled into the existing phone-fix PR.** The breadcrumb is a separate concern but lives in the same branch per the user's instruction to stay on this branch. PR title still reads "phone formatter splits country code from area code"; could be renamed before merge.
- The breadcrumb modifies `account/page.tsx`, which **PR #103 also rewrites substantially** (nickname + URL editor). When both PRs merge into main, expect a merge conflict in this file. Conflict will be easy to resolve (different parts of the same component tree) but worth knowing about.
- "Profile" link target falls back to `/` for unclaimed users. Could be cleaner to suppress the link entirely in that case, but the fallback is sensible.

## Progress Update as of 2026-05-28 04:07 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixes the phone-number display in the account page's SMS card. US numbers were rendering as "+120 22503846" because the country-code parser used a greedy regex (`\d{1,3}`) that ate three digits for `+1` numbers. Replaced with a longest-prefix match against the known dial codes in COUNTRIES.

### Detail of changes made:
- New file `src/lib/format-phone.ts` exports `formatPhone(e164)`. Logic: longest-prefix match against `COUNTRIES` dial codes (sorted by length desc). NANP (+1 + 10 digits) formats as `+1 (XXX) XXX-XXXX`; other international codes render as `<dial> <rest>` (no further grouping — we don't ship a full libphonenumber).
- `src/components/AccountSetupForm.tsx`: removed the inline `formatPhone` helper, imports the new module.
- `tests/lib/format-phone.test.ts`: 8 unit tests including a regression case for the `+120 ` bug, NANP formatting, Canadian (+1), UK / FR / DE international codes, edge cases (non-digit body, unknown dial code, no leading +).
- All 8 tests pass.

### Potential concerns to address:
- **Local dev currently can't sign in** because the Vercel "development" env vars point at a Clerk development instance (`robust-seahorse-42.clerk.accounts.dev`) that no longer exists (returns `resource_not_found`). Out of scope for this PR; testing the fix happens on the Vercel preview deploy instead.
- The `KNOWN_DIALS` lookup is over a static COUNTRIES list (currently ~30 entries). If we ever add a country with a dial code that's a substring of a longer one already in the list (we don't have any today), the longest-first sort handles it; but the list and dials should still be reviewed when added to.
- For non-NANP international numbers we just space-separate `<dial>` from the rest. A nicer rendering would group by country-specific conventions; deferred to when/if a full phone library is needed.
