# Lifecycle welcome emails — design spec

Date: 2026-05-27
Branch: `lifecycle-welcome-emails`
Status: design approved; spec under user review.

## Problem / goal

Personally email people (from DROdio, cc founder@festival.so) at two lifecycle
moments, once each:

1. **Profile claim** — someone claims a scored profile.
2. **Developer API signup** — someone creates their first Developer API key.

Each email has a **full** and a **short** variant; the short variant is sent when
the person has *already* hit the other milestone (so we don't repeat the whole
intro pitch). Delivery must be reliable (retries) and de-duplicated (once per
person per kind). Existing claimants/devs get a one-time **backfill**, gated so
the operator sees the count before it sends.

## Triggers & data sources

- `claim_welcome` — source of truth that a claim happened: a `users` row with a
  non-null `evaluation_id` (this is how claims are recorded; see `auto-claim.ts`
  `insertClaim` and `/claim/callback`).
- `dev_api_welcome` — source of truth that someone signed up for the API: ≥1 row
  in `api_keys` for that `clerk_user_id` (any key, revoked or not).

Both are keyed by Clerk user id.

## Variant selection (at send time)

- `claim_welcome`: **short** if the recipient already has an `api_keys` row, else
  **full**.
- `dev_api_welcome`: **short** if the recipient already has a `users` row with an
  `evaluation_id`, else **full**.

"Already" = state at the moment of sending. If someone does both before either
email goes out, both send as **short** (the claim-short carries the intro; the
dev-short omits it, so there's no duplicate intro in that ordering).

> Known asymmetry (intentional, per the supplied copy): the **claim-short** body
> keeps the "side project / my profile / Chief" intro, while the **dev-short**
> body omits it. In the "API-first, then claim" ordering the recipient therefore
> sees the intro twice (full dev email, then claim-short). Accepted as-is.

## Tracking (idempotency + retry)

New table `sent_emails`:

```
sent_emails(
  id            uuid pk default gen_random_uuid(),
  clerk_user_id text not null,
  kind          text not null,            -- 'claim_welcome' | 'dev_api_welcome'
  sent_at       timestamptz not null default now(),
  unique(clerk_user_id, kind)
)
```

A row is written **only after a successful send** (or a deliberate skip — see
edge cases). Selection joins against it, so a failed send leaves no row and is
retried next run. Generalized by `kind` so future lifecycle emails reuse it.

(Chosen over a `users.welcome_email_sent_at` column because a developer who signs
up for the API may have no `users` row at all.)

## Mechanism — one cron, two passes

New route `src/app/api/cron/lifecycle-emails/route.ts` (GET), authorized with the
same cron check as `scoring-tick`. Added to `vercel.json` crons at `*/2 * * * *`.

Cron auth is currently a private `isAuthorizedCron` inside `scoring-tick/route.ts`.
Extract it to `src/lib/cron-auth.ts` (pure function) and import it in both routes
(refactor scoring-tick to use it — low-risk, no behavior change).

Each pass:
1. No-op unless its flag is on (see below).
2. Select up to `CAP` (=30) recipients who qualify and have no `sent_emails` row
   for that kind. Order oldest-first (stable backfill drain).
3. Resolve each recipient's primary email + first name from Clerk (batched
   `clerkClient.users.getUserList({ userId: [...] })`, like `resolveEmails` in the
   profiles page).
4. Determine the variant (per "Variant selection").
5. Send. On success, insert the `sent_emails` row. On send failure, leave it (retry).

`CAP=30` per pass × every 2 min ≈ 900/pass/hour — spreads the backfill and stays
well under Resend limits.

### Flags (default OFF)

- `CLAIM_WELCOME_EMAIL_ENABLED`
- `DEV_API_WELCOME_EMAIL_ENABLED`

A pass is a no-op while its flag is unset/off. This lets us deploy, report each
backlog count, and have the operator enable each stream independently when ready.

## Emails (`src/lib/email.ts`)

Shared constants:
- `FROM_DRODIO = "DROdio <drodio@festival.so>"`
- `WELCOME_CC = "founder@festival.so"`
- Links: `MY_PROFILE_URL = https://festival.so/profile/founder/daniel-r-odio`,
  `CHIEF_URL = https://chief.bot`, `DEVELOPERS_URL = https://festival.so/developers`.
- `escapeHtml()` helper — first names are Clerk-controlled and MUST be escaped
  (the file already warns about interpolating user data).

First name: `firstNameFor(clerkFirstName, fallbackName?)` →
`clerkFirstName?.trim()` || first whitespace-token of `fallbackName` || `"there"`.
- claim: `fallbackName` = the claimed profile's full name.
- dev: no fallbackName → `"there"`.

Pure render fns return `{ subject, html }`:
- `renderClaimWelcomeEmail({ firstName, profileUrl, short })`
- `renderDevApiWelcomeEmail({ firstName, short })`

Send fns call `client().emails.send({ from: FROM_DRODIO, to, cc: WELCOME_CC, subject, html })`:
- `sendClaimWelcomeEmail({ to, firstName, profileUrl, short })`
- `sendDevApiWelcomeEmail({ to, firstName, short })`

### Subjects

- claim full: `{First} - Welcome to Founder Festival + what to build? (and FYI on API)`
- claim short: `+ profile! what to build next?`  *(literal; no first name)*
- dev full: `{First} - LMK what you do with the Festival Developer API! + ideas?`
- dev short: `+ LMK what you do with the Festival Developer API! + ideas?`  *(literal; no first name)*

### Bodies (rendered as HTML; `*word*` → `<em>word</em>`)

**claim — full**
```
{First}, saw you created a profile on Festival: {profileUrl}

How'd you hear about it?

Festival it's a side project I created as a founder myself. (Here's [my profile]).
My day job is CEO of [Chief].

I'd love to get your feedback on Festival. What did you like; learn; long-for?
What's the next feature I should build into it?

LMK if you try using the [Festival API] to build an app that uses founder &
investor scoring into any agentic systems you have. I'll be happy to feature
your work. (I made it hella easy to drop into Claude Code or similar.)

DROdio
```

**claim — short** (already an API signup)
```
{First},

Saw you *also* created a profile on Festival: {profileUrl}

How'd you hear about it?

Festival it's a side project I created as a founder myself. (Here's [my profile]).
My day job is CEO of [Chief].

I'd love to get your feedback on Festival. What did you like; learn; long-for?
What's the next feature I should build into it?

DROdio
```

**dev API — full**
```
{First},

Saw you signed up for the Festival developer API. I'm very interested to see what
you do with it, and how I can support you!

BTW, how'd you hear about it?

Festival it's a side project I created as a founder myself. (Here's [my profile]).
My day job is CEO of [Chief].

I'd love to get your feedback on the [Festival API]. What other endpoints would
you like to see exposed?

DROdio
```

**dev API — short** (already claimed a profile)
```
{First},

Saw you *also* signed up for the Festival developer API. I'm very interested to
see what you do with it, and how I can support you!

I'd love to get your feedback on the API. What other endpoints would you like to
see exposed?

DROdio
```

Links by variant: `[my profile]`→`MY_PROFILE_URL`, `[Chief]`→`CHIEF_URL`,
`[Festival API]`→`DEVELOPERS_URL`. `{profileUrl}` = `canonicalProfileUrl(evalId)`
for the claimed profile. The dev-short body has no links.

## Edge cases

- **Super-admins** (`SUPER_ADMIN_EMAILS`) and the from/cc addresses: do not email;
  write the `sent_emails` row anyway so they drain from the backlog (no self-emails).
- **No resolvable email**: skip and write the `sent_emails` row (can never send;
  avoids a permanent backlog item). Rare — signed-in users have an email.
- **Clerk lookup failure** for a recipient this run: skip without writing a row →
  retried next run.
- **One dev email per person** regardless of how many keys they have (keyed by
  `clerk_user_id`).
- **Profile URL unavailable** (`canonicalProfileUrl` returns null): fall back to
  `https://festival.so` so the email still sends.

## Migrations

- `sent_emails` table (additive, no FK). Generate via drizzle, apply to DEV;
  prod applied manually (per `prod-database-identity` memory) before merge.

## Testing

- `renderClaimWelcomeEmail` (full + short): subject correct per variant; html
  contains the profile URL + the right links; first name escaped; short variant
  omits the API paragraph and uses the `+ profile!` subject.
- `renderDevApiWelcomeEmail` (full + short): subject per variant; full has the
  intro links, short has none and uses the `+ LMK` subject.
- `firstNameFor`: clerk name wins; falls back to profile name token; then `"there"`.
- `escapeHtml`: angle brackets / quotes neutralized.
- `cron-auth` (`isAuthorizedCron`): localhost bypass only off-prod; bearer secret
  required otherwise (port the existing behavior into a unit test on extraction).
- Cron sweep selection/variant/send: integration-ish (DB + Clerk + Resend) — kept
  thin; the variant + render logic above is the unit-tested core. Manual smoke
  with the flags off (no-op) then on against a seeded row.

## Rollout

1. Ship with both flags **off** (cron deployed, no-op). Apply the `sent_emails`
   migration to prod.
2. Report the two backlog counts (existing claimants; existing API signups).
3. Operator flips `CLAIM_WELCOME_EMAIL_ENABLED` / `DEV_API_WELCOME_EMAIL_ENABLED`
   when ready; the cron drains each backlog (rate-limited) and handles new
   events going forward.

## Out of scope

- Per-recipient unsubscribe management (these are low-volume, founder-personal
  1:1 emails; Resend/List-Unsubscribe can be added later if volume grows).
- Editing/templating UI — copy lives in code.
