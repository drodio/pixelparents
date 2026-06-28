# Claim flow identity matching — design

**Status:** approved (2026-05-22, drodio@gmail.com)
**Branch context:** `polish` — applies to the `/welcome` claim flow used by rating buttons (`Recommendations.tsx`) and the events CTA (`EventsCTA.tsx`).

## Goal

When a non-owner clicks a rating button (1–4 / "Hell No" → "Hell Yes") or the events CTA on `/welcome?e=<id>`, the `ClaimProfileModal` opens and the user authenticates via LinkedIn, GitHub, or email. Ownership is granted **only** at 100% confidence — i.e., a specific, exactly-comparable identity signal. The user is told *how* we confirmed them on success; if they sign in but we can't reach 100%, we tell them why and steer them to LinkedIn.

The bar is "no one ends up owning someone else's evaluation row." We accept a narrow class of false positives (e.g., two `jordan.lee@acme.com` colleagues at the same company); we don't accept anything weaker than that.

## Non-goals

- Multi-account merging (one Clerk user claims multiple evaluations).
- Re-claim flows or revoke/transfer.
- Manual-review queue for denied claims.
- A second sign-in path that grants browsing without ownership (today everyone can browse anonymously).

## Architecture overview

```
Recommendations / EventsCTA          (client)
  └─ ClaimProfileModal               (client; Clerk useSignIn)
       ├─ LinkedIn  → /claim/sso-callback → /claim/callback?e=…&return=welcome
       ├─ GitHub    → /claim/sso-callback → /claim/callback?e=…&return=welcome
       └─ Email     → /claim/sso-callback → /claim/callback?e=…&return=welcome
                                                                │
                                                                ▼
                                            /claim/callback/route.ts (server)
                                              ├─ load evaluation
                                              ├─ build ClerkClaim from currentUser
                                              ├─ matchConfidence(claim, eval, profile)
                                              │     → { confidence, signal }
                                              ├─ upsert users row (if match)
                                              └─ redirect with query params
                                                  • match     → /welcome?e=…&claimed=<signal>
                                                  • no-match  → /welcome?e=…&claim_failed=<provider>
                                                  • LinkedIn mismatch → /welcome?e=…&claim_mismatch=1
                                                                │
                                                                ▼
                                                /welcome/page.tsx
                                                  ├─ banner on ?claimed
                                                  ├─ reopen modal w/ hint on ?claim_failed
                                                  └─ "score yours instead" overlay on ?claim_mismatch
```

## Section 1: Eval-time data extraction

### Schema additions

`SCORING_SCHEMA` in `src/lib/scoring.ts` gains two optional string fields:

```ts
publicEmail: z.string().email().nullable(),
githubUsername: z.string().nullable(),
```

Both are extracted by Claude during scoring. Persisted on `evaluations.profile` JSONB alongside `fullName` and `primaryCompanyDomain`:

```ts
profile: {
  fullName: scoring.fullName,
  primaryCompanyDomain: scoring.primaryCompanyDomain,
  publicEmail: scoring.publicEmail,
  githubUsername: scoring.githubUsername,
  mmHits,
}
```

### Prompt additions

`SCORING_RUBRIC` gets a new section:

```
==== EXTRACTED FIELDS — IDENTITY (for claim matching) ====
- publicEmail: a real email address explicitly attributed to the subject in
  one of the search highlights or the LinkedIn page text (e.g., from a press
  contact, a personal site, an "Email me at X" mention). NEVER guess from
  domain heuristics. Null if no source surfaces a literal email.
- githubUsername: the subject's GitHub username if a github.com/<user> link
  appears next to their name on LinkedIn or in any highlight. NEVER guess
  from name patterns. Null if absent.
```

Hard rule: these fields are **observed**, not **inferred**. If Claude only sees "his email is somewhere on his personal site" but no literal address, `publicEmail` stays `null`.

### Backward compatibility

Legacy rows lack these fields. The matcher treats `null` the same as "absent" and falls through to fallback rules.

## Section 2: Matching logic

A single `matchConfidence()` function in `src/lib/identity-match.ts` returns:

```ts
type MatchResult =
  | { kind: "match"; signal: MatchSignal }
  | { kind: "no-match"; reason: NoMatchReason };

type MatchSignal =
  | "linkedin-vanity"
  | "github-username"
  | "email-exact"
  | "email-name-company";

type NoMatchReason =
  | "linkedin-vanity-mismatch"
  | "github-no-stored-username"
  | "github-username-mismatch"
  | "email-no-domain"
  | "email-no-signal";
```

### LinkedIn

```ts
if (claim.provider === "linkedin") {
  if (!claim.linkedinUrl) return { kind: "no-match", reason: "linkedin-vanity-mismatch" };
  return normalize(claim.linkedinUrl) === normalize(eval.linkedinUrl)
    ? { kind: "match", signal: "linkedin-vanity" }
    : { kind: "no-match", reason: "linkedin-vanity-mismatch" };
}
```

`normalize()` lowercases, strips `www.`, strips trailing slash. (Existing helper, reused.)

### GitHub

```ts
if (claim.provider === "github") {
  const stored = profile?.githubUsername?.toLowerCase();
  if (!stored) return { kind: "no-match", reason: "github-no-stored-username" };
  if (!claim.githubUsername) return { kind: "no-match", reason: "github-username-mismatch" };
  return claim.githubUsername.toLowerCase() === stored
    ? { kind: "match", signal: "github-username" }
    : { kind: "no-match", reason: "github-username-mismatch" };
}
```

No display-name fallback. If we didn't extract a GitHub username during eval, GitHub auth always falls through.

### Email — two tiers

```ts
if (claim.provider === "email") {
  if (!claim.email) return { kind: "no-match", reason: "email-no-domain" };
  const claimEmail = claim.email.toLowerCase();
  const [localPart, claimDomain] = claimEmail.split("@");
  if (!localPart || !claimDomain) return { kind: "no-match", reason: "email-no-domain" };

  // Tier 1: exact match against publicEmail captured at eval time
  const storedEmail = profile?.publicEmail?.toLowerCase();
  if (storedEmail && storedEmail === claimEmail) {
    return { kind: "match", signal: "email-exact" };
  }

  // Tier 2: domain matches primaryCompanyDomain AND local-part matches subject's name
  const targetDomain = profile?.primaryCompanyDomain?.toLowerCase();
  const fullName = (profile?.fullName ?? "").trim();
  if (targetDomain && fullName && domainMatches(claimDomain, targetDomain) && localPartMatchesName(localPart, fullName)) {
    return { kind: "match", signal: "email-name-company" };
  }

  return { kind: "no-match", reason: "email-no-signal" };
}
```

#### `domainMatches(claim, target)`

```ts
claim === target || claim.endsWith("." + target)
```

(Allows `eu.acme.com` to match `acme.com`. Not the other way around.)

#### `localPartMatchesName(localPart, fullName)`

Tokenize `fullName` on whitespace, strip hyphens/apostrophes/accents (NFD-normalize, drop combining marks), lowercase. From `["jordan", "lee"]` produce the accepted set:

```
first             → "jordan"
last              → "lee"
firstlast         → "jordanlee"
first.last        → "jordan.lee"
first_last        → "jordan_lee"
first-last        → "jordan-lee"
firstinitiallast  → "jlee"
firstinitial.last → "j.lee"
firstinitial_last → "j_lee"
lastfirst         → "leejordan"
last.first        → "lee.jordan"
```

For multi-token names (e.g., "Mary Jane Smith"), generate combinations using `first = tokens[0]` and `last = tokens[tokens.length - 1]`. Middle tokens are ignored to keep the set bounded. The lowercased `localPart` (with leading-trailing punctuation stripped, plus any `+suffix` like `jordan+spam@acme.com` removed) must be a member of that set.

Accepted false positives:
- `jordan.lee@acme.com` matches any Jordan Lee whose employer domain is acme.com (cohabiting namesakes).
- Unicode names like `josé` will need normalization to `jose`; we accept that some users with diacritics in their actual email may not match.

### Empty fallback

If none of the providers above produce a `match`, return `no-match` with the most specific reason.

## Section 3: Claim flow UX

### `/claim/callback/route.ts`

```ts
const matchResult = matchConfidence(claim, evalRow.linkedinUrl, profile);

if (matchResult.kind === "match") {
  await upsertUserRow({ clerkUserId, evaluationId, matchConfidence: "high",
                        verifiedVia: claim.provider, verifiedSignal: matchResult.signal });
  return redirect(`/welcome?e=${id}&claimed=${matchResult.signal}`);
}

// No-match branches
if (claim.provider === "linkedin") {
  return redirect(`/welcome?e=${id}&claim_mismatch=1`);
}
return redirect(`/welcome?e=${id}&claim_failed=${claim.provider}`);
```

Notes:
- `verifiedSignal` is a new `text` column on the `users` table. Nullable; legacy rows stay `null`. Migration via `drizzle-kit generate` + `db:push`.
- `upsertUserRow` uses `onConflictDoUpdate` keyed by `clerk_user_id` so an existing row's `matchConfidence` / `verifiedSignal` get refreshed if the user re-claims the same eval through a different provider.

### `/welcome/page.tsx` rendering

The page server-side reads three query params: `?claimed`, `?claim_failed`, `?claim_mismatch`. Each drives a small client component:

1. **`?claimed=<signal>`** — `<ClaimSuccessBanner signal={signal} />`. Renders a gold-on-dark banner above the score block:

   > ✓ Confirmed you own this profile via **LinkedIn account match**.

   Labels per signal:
   - `linkedin-vanity` → "LinkedIn account match"
   - `github-username` → "GitHub username match"
   - `email-exact` → "Email match"
   - `email-name-company` → "Email match (name + company)"

   On mount, the banner calls `router.replace` to strip the `claimed` query param so a hard refresh doesn't re-show it. Dismissible via "×".

2. **`?claim_failed=<provider>`** — Re-renders `ClaimProfileModal` with `initialBanner` set:

   > We couldn't confirm you own this profile via **GitHub**. Try LinkedIn instead.

   Only the LinkedIn button is styled prominently; GitHub/email remain visible but muted.

3. **`?claim_mismatch=1`** — `<MismatchOverlay fullName={row.fullName} />`. Full-screen overlay (similar to ClaimProfileModal styling):

   > This is **Jon Staenberg**'s profile.
   >
   > Want to score yours instead?
   >
   > `[ https://linkedin.com/in/  your-handle ]`  [ Check My Score ]

   Submits the same way the splash form does (POST `/api/eval`, redirect to the new eval). Has a small ✕ to dismiss back to read-only viewing.

### `isOwner` computation (existing)

After successful claim, `users` row exists with `matchConfidence='high'`. The current `/welcome` server query already accepts `'high' || 'medium'` — keep accepting both for now so legacy rows don't break, but new claims only ever write `'high'`.

## Section 4: Resolved — Clerk LinkedIn vanity is unavailable

**Diagnostic ran 2026-05-22 with a real LinkedIn sign-in.** Findings:

```json
{
  "provider": "oauth_linkedin_oidc",
  "approvedScopes": "email openid profile",
  "providerUserId": "jK-cFzo1CD",      // LinkedIn's opaque internal id
  "emailAddress": "drodio@gmail.com",
  "firstName": "DROdio",
  "lastName": "- Daniel R. Odio",
  "username": null,                     // ← always null for OIDC
  "verification": { "status": "verified" }
}
```

**Conclusion:** `external_account.username` is always `null` for LinkedIn OIDC. The vanity URL slug is not in any field Clerk surfaces. LinkedIn deprecated the `r_liteprofile` / `r_basicprofile` scopes that previously exposed `vanityName`, so newer apps cannot fetch it via the LinkedIn API either. The original "linkedin-vanity" signal as designed is unimplementable.

**Design pivot (replaces the original LinkedIn match rule):**

When the user signs in via LinkedIn, we have a verified `emailAddress`, `firstName`, and `lastName`. We confirm ownership when ANY of these matches the eval profile:

- `linkedin-email-exact`: LinkedIn-verified email === `profile.publicEmail` (lowercased)
- `linkedin-email-name-company`: LinkedIn-verified email matches the email name+company tier described in Section 2 (domain + local-part-matches-name)
- `linkedin-name-match`: LinkedIn `firstName + lastName` (normalized via `stripDiacritics`/lowercase) === `profile.fullName` normalized

If none of the three triggers, `kind: "no-match", reason: "linkedin-no-signal"`. The MismatchOverlay still shows in that case (UX matches the original spec — "this is someone else's profile, score yours instead?").

`MatchSignal` enum is updated accordingly:

```ts
type MatchSignal =
  | "linkedin-email-exact"
  | "linkedin-email-name-company"
  | "linkedin-name-match"
  | "github-username"
  | "email-exact"
  | "email-name-company";
```

Banner labels:

- `linkedin-email-exact` → "LinkedIn email match"
- `linkedin-email-name-company` → "LinkedIn email (name + company) match"
- `linkedin-name-match` → "LinkedIn name match"
- `github-username` → "GitHub username match"
- `email-exact` → "Email match"
- `email-name-company` → "Email match (name + company)"

The Task 7 matcher implementation reflects this. No other section of the design changes.

**Aside — a separate bug surfaced during the diagnostic:**

The original `signIn.sso()` call in `ClaimProfileModal.tsx` and `claim/page.tsx` was using the new "Future" useSignIn hook (default export of `@clerk/nextjs`), where `sso()` exists but is half-implemented (returns `{result: undefined, error: null}` and does not navigate). Switching to `import { useSignIn } from "@clerk/nextjs/legacy"` (which returns the stable SignInResource with `authenticateWithRedirect`) fixes the OAuth flow. Both files updated as part of Task 1.

## Data model changes

### `evaluations.profile` JSONB

Adds two optional keys (no migration; JSONB is structural):
- `publicEmail: string | null`
- `githubUsername: string | null`

### `users` table

Adds one column:

```sql
ALTER TABLE users ADD COLUMN verified_signal TEXT;
```

Drizzle schema:

```ts
verifiedSignal: text("verified_signal"),
```

Nullable. Legacy rows: `null`. New successful claims: one of the four `MatchSignal` literals.

## Testing

- `tests/lib/identity-match.test.ts` extended with cases per signal + per no-match reason. Specifically:
  - LinkedIn vanity exact / mismatch / missing
  - GitHub username exact / mismatch / no stored username
  - Email exact (publicEmail match)
  - Email name+company: every accepted local-part pattern × multiple sample names; unicode normalization; `+suffix` stripping; subdomain matching
  - Email no-domain / mismatched domain / wrong local-part
- `tests/lib/scoring.test.ts` updated with one fixture that includes `publicEmail` + `githubUsername` to confirm the schema accepts them.

## Open items (resolved during implementation, not blocking design)

- Verify Clerk LinkedIn external account shape (Section 4).
- Confirm Clerk dashboard has GitHub + Email auth enabled for the new "Founder Festival" instance.
- Decide whether the `ClaimSuccessBanner` is a banner or a less-intrusive toast — try banner first, swap if it feels heavy.

## Rollout

- Single PR off `polish`.
- Backfilling `publicEmail` / `githubUsername` on existing rows is **out of scope** — they stay `null`, and GitHub/email claims on them always fall through to LinkedIn. The operator can `Re-Score Me` on individual evals to backfill.
- No feature flag — the change replaces the existing matching logic in-place.
