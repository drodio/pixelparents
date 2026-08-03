# fix/clerk-account-portal-deadlinks

"Login broke again." Root-caused to a silent Clerk fallback, and fixed with a
tested invariant so it can't come back.

## Progress Update as of [August 3, 2026 — 1:14 PM Pacific]

### Summary of changes since last update

Clerk was routing users to its Account Portal (`accounts.<domain>`), which is NOT
provisioned for this instance — **accounts.gopixel.org 404s, accounts.pixelparents.org
403s**. Pinned `signInUrl`/`signUpUrl` on both hosts, added the missing `/sign-up`
route, and centralised the logic behind unit tests. typecheck / lint / test
(**922**) / build all exit 0.

### Root cause — three compounding problems

The infrastructure was fine, which is why this kept getting misdiagnosed:
`clerk.gopixel.org` 200, both domains shipping the correct publishable key, both
`/sign-in` pages rendering with zero console errors.

The break was in Clerk's URL config:

1. **`signUpUrl` was never set** anywhere. Clerk fell back to
   `accounts.<domain>/sign-up`. Proven live: the sign-in widget's "Sign up" link
   read `href="https://accounts.pixelparents.org/sign-up"` → **403**.
2. **`signInUrl` was only set on the SATELLITE**
   (`isSatellite ? "https://gopixel.org/sign-in" : undefined`). On the primary it
   was `undefined`, so Clerk fell back to `accounts.gopixel.org/sign-in` →
   **404**. Any Clerk-initiated sign-in redirect on gopixel.org died.
3. **There was no `/sign-up` route at all** — only `/sign-in`. Even with the prop
   set, Clerk had nowhere to send people.

The nasty part: an unset prop does not fail loudly. Clerk silently substitutes a
portal URL, so this looks fine in code review, builds clean, and only breaks for
real users mid-flow.

### Detail of changes made:

- **`lib/clerk-urls.ts` (new)** — single source of truth: `clerkAuthUrls(isSatellite)`
  and `isSatelliteHost(host)`. Satellite gets ABSOLUTE primary URLs (a relative
  path would keep the user on the satellite host, where the cross-domain
  handshake can't complete); primary gets relative paths so preview deployments
  work too. `isSatelliteHost` strips a port, so `localhost:3000` resolves to primary.
- **`lib/clerk-urls.test.ts` (new, 12 tests)** — these exist because of an outage,
  not for coverage. They assert, for BOTH hosts, that the URLs are never
  empty/undefined, **never contain `accounts.`**, and that sign-in/sign-up are
  distinct.
- **`app/(authed)/sign-up/[[...sign-up]]/page.tsx` (new)** — self-hosted Clerk
  sign-up mirroring `/sign-in`. Catch-all so Clerk owns its sub-paths
  (verify-email-address, sso-callback, continue). Redirects new members to
  `/signup` (the GoPixel community form) rather than an empty dashboard. Only
  relative `redirect_url` values are honored, matching /sign-in's open-redirect guard.
- **`app/(authed)/layout.tsx`** — both props now always supplied, sourced from the
  shared helper.
- **`proxy.ts`** — same helper, so the middleware and `<ClerkProvider>` can no
  longer drift. Previously each had its own copy of the host check and its own
  `PRIMARY_SIGN_IN_URL`.

### Verification run

- `typecheck` 0, `lint` 0, `test` 0 (**922**), `build` 0.
- Build output confirms the new route: `ƒ /sign-up/[[...sign-up]]`.
- Pre-fix, live: read `href="https://accounts.pixelparents.org/sign-up"` straight
  off the rendered sign-in widget's accessibility tree — that was the smoking gun.

### Potential concerns to address:

- **Not yet re-verified in a live browser after deploy.** Do this: load
  /sign-in on BOTH domains and confirm the "Sign up" link now points at
  `/sign-up` (not `accounts.*`), then walk one full sign-in.
- Clerk's own display_config still advertises `accounts.<domain>` as its
  sign_in_url/sign_up_url. We now override it everywhere it matters, but if the
  Account Portal is ever wanted, it must actually be provisioned first.
- The Clerk **application name is still "Pixel Parents"**, so the widget reads
  "Sign in to Pixel Parents". Dashboard-only setting; Daniel's to change.
- `/signup` (community form) vs `/sign-up` (Clerk credentials) are one hyphen
  apart. Deliberate — /sign-up is Clerk's convention and /signup predates it —
  but it is a genuine footgun for the next person.
